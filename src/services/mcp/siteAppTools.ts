/**
 * The `calc_*` tools for the assistant of the site (platform build, `window.__OPDS_APP__`).
 *
 * On the site there is no Tauri bridge and no local port: the assistant sends its tool calls through the bridge of the
 * site to this interface in the frame of the application. Behind it runs the code behind the desktop MCP tools:
 * `executeDesktopCommand`, the assistant proposals and the action catalogue. There is no second implementation of the
 * estimate logic; only the transport differs. What needs a file system or a popup answers `niet_in_browser`: opening
 * and saving run through the host contract, by the user.
 *
 * The object lives on the window of the application; whoever can reach it already runs in that frame. The bridge of the
 * site decides what comes in from outside. The MCP layer loads as a separate chunk on the first call.
 */
import definitions from './siteAppTools.json';
import type { CostItem } from '@/types/costModel';

export interface SiteAppToolDefinition { name: string; description: string; inputSchema: object }
export interface SiteAppTools {
  /** Names of the tools that work here. */
  tools(): Promise<string[]>;
  /** Their definitions, like `tools/list`. */
  definitions(): Promise<SiteAppToolDefinition[]>;
  /** Execute one tool. A refusal becomes an error. */
  run(name: string, args?: Record<string, unknown>): Promise<unknown>;
}

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
/** A tool answer goes into the context of a small model; a bigger answer has to be narrowed down. */
const MAX_RESULT_CHARS = 30000;
const SIGNATURES_PER_ANSWER = 25;

/** Workspace actions that need a file system, a popup or browser storage the frame does not have. */
const DESKTOP_ONLY = /^(file\.export$|export\.|recovery\.|workspace\.openSecondScreen$)/;

type Args = Record<string, unknown>;

function notInBrowser(action: string): Error {
  return new Error(`niet_in_browser: ${action} needs the desktop application; open and save through the site.`);
}

/** The columns of itemSummary in the MCP server, without the empty ones. */
function itemSummary(item: CostItem) {
  const row: Record<string, unknown> = { id: item.id, parentId: item.parentId, nr: item.nr, code: item.code, description: item.description,
    rowType: item.rowType, unit: item.unit, quantity: item.quantity, materialPrice: item.materialPrice, laborPrice: item.laborPrice,
    unitPrice: item.unitPrice, total: item.total, normQuantity: item.normQuantity, normUnitPrice: item.normUnitPrice,
    resourceType: item.resourceType, tariefGroep: item.tariefGroep, staartPercentage: item.staartPercentage };
  return Object.fromEntries(Object.entries(row).filter(([, value]) => value !== null && value !== undefined && value !== ''));
}

async function budgetSummary() {
  const [{ useAppStore }, { getStaartBreakdown }] = await Promise.all([import('@/state/appStore'), import('@/services/calculation/calculator')]);
  const state = useAppStore.getState();
  const documents = state.documents.map(doc => ({ id: doc.id, fileName: doc.fileName, isModified: doc.isModified, readOnly: doc.hostFile?.readOnly ?? false }));
  if (!state.activeDocumentId) return { documents, activeDocumentId: null };
  const { name, projectName, projectNumber, client, author, status, currency, tarieven } = state.schedule;
  return { documents, activeDocumentId: state.activeDocumentId,
    schedule: { name, projectName, projectNumber, client, author, status, currency, tarieven },
    chapters: state.items.filter(item => item.parentId === null && item.rowType === 'chapter').map(({ id, nr, code, description, total }) => ({ id, nr, code, description, total })),
    staartItems: state.items.filter(item => item.rowType.startsWith('staart_')).map(({ rowType, description, staartPercentage, total }) => ({ rowType, description, percentage: staartPercentage, total })),
    breakdown: getStaartBreakdown(state.items), itemCount: state.items.length, canUndo: state.canUndo() };
}

async function getItems(args: Args) {
  const { useAppStore } = await import('@/state/appStore');
  let rows = useAppStore.getState().items;
  if (typeof args.parentId === 'string') {
    const parent = args.parentId === 'root' ? null : args.parentId;
    rows = rows.filter(item => item.parentId === parent);
  }
  if (typeof args.rowType === 'string' && args.rowType) rows = rows.filter(item => item.rowType === args.rowType);
  if (typeof args.search === 'string' && args.search) {
    const query = args.search.toLowerCase();
    rows = rows.filter(item => item.description.toLowerCase().includes(query) || item.code.toLowerCase().includes(query));
  }
  const offset = Number.isInteger(args.offset) ? Math.max(0, args.offset as number) : 0;
  const limit = Number.isInteger(args.limit) ? Math.min(MAX_LIMIT, Math.max(1, args.limit as number)) : DEFAULT_LIMIT;
  return { total: rows.length, offset, items: rows.slice(offset, offset + limit).map(itemSummary) };
}

async function newBudget(args: Args) {
  const [{ useAppStore }, { createDefaultItems }, { uiText }] = await Promise.all([import('@/state/appStore'), import('@/data/defaultBudget'), import('@/i18n/uiText')]);
  const state = useAppStore.getState();
  const names = new Set(state.documents.map(doc => doc.fileName));
  const base = typeof args.fileName === 'string' && args.fileName.trim() ? args.fileName.trim() : uiText('newBudget', 'New budget');
  let fileName = base;
  for (let counter = 2; names.has(fileName); counter++) fileName = `${base} ${counter}`;
  const id = crypto.randomUUID();
  state.addDocument({ id, filePath: null, fileName, isModified: false, items: createDefaultItems() });
  return { documentId: id, fileName };
}

interface StructureRule { description: string; quantity?: number; unit?: string; normUnitPrice?: number; normQuantity?: number; tariefGroep?: string; resourceType?: string }
interface StructurePost { description: string; quantity?: number; unit?: string; rules?: StructureRule[] }
interface StructureChapter { code?: string; description: string; posts?: StructurePost[] }

/** Chapter by chapter through the rules of the assistant actions, published as one undo step. */
async function createStructure(args: Args) {
  const [{ useAppStore }, actions, { getStaartBreakdown }] = await Promise.all([
    import('@/state/appStore'), import('@/services/assistant/assistantActions'), import('@/services/calculation/calculator'),
  ]);
  const chapters = args.chapters as StructureChapter[];
  if (!chapters.length) throw new Error('chapters must not be empty');
  const state = useAppStore.getState();
  if (!state.activeDocumentId) throw new Error('No active document. Use calc_new_budget first.');
  let items = state.items;
  const step = (list: { type: string; [key: string]: unknown }[]) => {
    const before = new Set(items.map(item => item.id));
    const { items: next, results } = actions.simulateActies(list, items, state.schedule);
    const failed = results.filter(line => line.startsWith('✖'));
    if (failed.length) throw new Error(failed.join('\n'));
    items = next;
    return items.filter(item => !before.has(item.id));
  };
  const counts = { chapters: 0, posts: 0, rules: 0 };
  for (const chapter of chapters) {
    const [chapterRow] = step([{ type: 'add_hoofdstuk', code: chapter.code ?? '', omschrijving: chapter.description }]);
    counts.chapters += 1;
    for (const post of chapter.posts ?? []) {
      const parent = items.find(item => item.id === chapterRow.id)!;
      const [postRow] = step([{ type: 'add_post', onderNr: parent.nr, omschrijving: post.description, aantal: post.quantity, eenheid: post.unit }]);
      counts.posts += 1;
      if (post.rules?.length) {
        step(post.rules.map(rule => ({ type: 'add_regel', onderNr: postRow.nr, omschrijving: rule.description, aantal: rule.quantity, eenheid: rule.unit,
          prijs: rule.normUnitPrice, norm: rule.normQuantity, tariefgroep: rule.tariefGroep, resourceType: rule.resourceType })));
        counts.rules += post.rules.length;
      }
    }
  }
  actions.commitAssistantItems(items, 'calc_create_budget_structure');
  return { ...counts, grandTotal: getStaartBreakdown(items).aanneemsomAfgerond };
}

/** assistant.preview without whole rows: enough to report and to decide. */
async function preview(args: Args) {
  const { executeDesktopCommand } = await import('./desktopCommand');
  const proposal = await executeDesktopCommand('assistant.preview', { actions: args.actions }) as {
    id: string; results: string[]; errors: string[]; assumptions: string[]; beforeTotals: unknown; afterTotals: unknown;
    changes: { kind: string; before?: CostItem; after?: CostItem }[];
  };
  const summary = { proposalId: proposal.id, errors: proposal.errors, results: proposal.results, assumptions: proposal.assumptions,
    beforeTotals: proposal.beforeTotals, afterTotals: proposal.afterTotals,
    // Parents and tail costs change with every edit; the totals above cover those.
    changes: proposal.changes.filter(({ kind, before, after }) => kind !== 'changed' || before?.quantity !== after?.quantity || before?.description !== after?.description
      || before?.normUnitPrice !== after?.normUnitPrice || before?.normQuantity !== after?.normQuantity || before?.unit !== after?.unit || before?.tariefGroep !== after?.tariefGroep)
      .slice(0, 50).map(({ kind, before, after }) => ({ kind, nr: after?.nr ?? before?.nr, description: after?.description ?? before?.description,
        quantityBefore: before?.quantity, quantity: after?.quantity, totalBefore: before?.total, total: after?.total })) };
  if (args.apply !== true || proposal.errors.length) return { ...summary, applied: false };
  await executeDesktopCommand('assistant.apply', { proposalId: proposal.id });
  return { ...summary, applied: true };
}

async function listActions(args: Args) {
  const [{ default: catalogue }, { workspaceActions }] = await Promise.all([import('./desktopActions.json'), import('./workspaceActionCatalogue')]);
  const actions = catalogue.actions as unknown as Record<string, { group: string; signature: string }>;
  const hidden = (action: string, group?: string) => group === 'Accounts' || DESKTOP_ONLY.test(action);
  if (typeof args.action === 'string') {
    const known = Object.prototype.hasOwnProperty.call(actions, args.action);
    if (hidden(args.action, known ? actions[args.action].group : undefined)) throw notInBrowser(args.action);
    const found = known ? actions[args.action] : (workspaceActions as Record<string, unknown>)[args.action];
    if (!found) throw new Error(`Unknown action: ${args.action}`);
    return { action: args.action, ...found as object };
  }
  const all = [
    ...Object.entries(actions).filter(([name, value]) => !hidden(name, value.group)).map(([name, value]) => ({ name, group: value.group, signature: value.signature })),
    ...Object.entries(workspaceActions).filter(([name]) => !hidden(name)).map(([name, value]) => ({ name, group: name.split('.')[0], signature: value.description })),
  ];
  const group = typeof args.group === 'string' ? args.group.toLowerCase() : '';
  const words = typeof args.search === 'string' ? args.search.toLowerCase().split(/\s+/).filter(Boolean) : [];
  if (!group && !words.length) {
    const groups: Record<string, number> = {};
    for (const entry of all) groups[entry.group] = (groups[entry.group] ?? 0) + 1;
    return { groups };
  }
  const matches = all.filter(entry => (!group || entry.group.toLowerCase() === group)
    && words.every(word => `${entry.name} ${entry.signature}`.toLowerCase().includes(word)));
  return { total: matches.length, actions: matches.slice(0, SIGNATURES_PER_ANSWER) };
}

async function runAction(args: Args) {
  const action = args.action as string;
  const { default: catalogue } = await import('./desktopActions.json');
  const entry = (catalogue.actions as unknown as Record<string, { group?: string }>);
  const group = Object.prototype.hasOwnProperty.call(entry, action) ? entry[action].group : undefined;
  if (group === 'Accounts' || DESKTOP_ONLY.test(action)) throw notInBrowser(action);
  const { executeDesktopCommand } = await import('./desktopCommand');
  return executeDesktopCommand(action, (args.params ?? {}) as Args);
}

/** Refuse what would flood the context of the model; the caller can narrow it down. */
function bounded(name: string, result: unknown): unknown {
  const size = JSON.stringify(result ?? null).length;
  if (size > MAX_RESULT_CHARS) throw new Error(`te_groot: the answer of ${name} has ${size} characters; narrow it down, for instance with calc_get_items.`);
  return result;
}

export function createSiteAppTools(): SiteAppTools {
  const handlers: Record<string, (args: Args) => Promise<unknown>> = {
    calc_get_budget_summary: budgetSummary,
    calc_get_items: getItems,
    calc_new_budget: newBudget,
    calc_create_budget_structure: createStructure,
    calc_preview: preview,
    calc_apply: async args => (await import('./desktopCommand')).executeDesktopCommand('assistant.apply', { proposalId: args.proposalId }),
    calc_undo: async () => (await import('./desktopCommand')).executeDesktopCommand('undo', {}),
    calc_list_actions: listActions,
    calc_action: runAction,
  };
  return {
    async tools() { return definitions.tools.map(def => def.name); },
    async definitions() { return definitions.tools; },
    async run(name, args = {}) {
      if (!Object.prototype.hasOwnProperty.call(handlers, name)) throw new Error('onbekende_tool');
      const { validateArgument } = await import('./desktopCommand');
      const schema = definitions.tools.find(def => def.name === name)!.inputSchema;
      validateArgument(args, schema as never, 'argument');
      return bounded(name, await handlers[name](args));
    },
  };
}

/** Put `window.__OPDS_APP__` in place (platform build only, `main.tsx`). */
export function installSiteAppTools(target: { __OPDS_APP__?: SiteAppTools } = window as never): void {
  target.__OPDS_APP__ = createSiteAppTools();
}
