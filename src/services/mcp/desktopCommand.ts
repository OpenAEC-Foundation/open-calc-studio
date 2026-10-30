import catalogue from './desktopActions.json';
import { workspaceActions } from './workspaceActionCatalogue';
import { useAppStore } from '@/state/appStore';
import { deserializeProject, serializeProject } from '@/services/file/fileService';
import { openProjectInStore } from '@/services/file/openProject';
import { recalculateItems } from '@/services/calculation/calculator';

export interface JsonSchema { type?: string; enum?: unknown[]; anyOf?: JsonSchema[]; properties?: Record<string, JsonSchema>; required?: string[]; additionalProperties?: boolean | JsonSchema; items?: JsonSchema }
export function validateArgument(value: unknown, schema: JsonSchema, path = 'argument'): void {
  if (schema.anyOf) {
    if (schema.anyOf.some(s => { try { validateArgument(value, s, path); return true; } catch { return false; } })) return;
    throw new Error(`${path}: value does not match the declared type`);
  }
  if (schema.enum && !schema.enum.includes(value)) throw new Error(`${path}: expected ${schema.enum.join(', ')}`);
  if (schema.type === 'null' && value !== null) throw new Error(`${path}: expected null`);
  if (['string', 'number', 'boolean'].includes(schema.type ?? '') && typeof value !== schema.type) throw new Error(`${path}: expected ${schema.type}`);
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error(`${path}: expected finite number`);
  if (schema.type === 'array') {
    if (!Array.isArray(value)) throw new Error(`${path}: expected array`);
    value.forEach((v, i) => validateArgument(v, schema.items ?? {}, `${path}[${i}]`));
  }
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path}: expected object`);
    for (const key of schema.required ?? []) if (!(key in value)) throw new Error(`${path}.${key}: required`);
    for (const [key, v] of Object.entries(value)) {
      const s = schema.properties?.[key];
      if (s) validateArgument(v, s, `${path}.${key}`);
      else if (schema.additionalProperties === false) throw new Error(`${path}.${key}: unknown field`);
      else if (typeof schema.additionalProperties === 'object') validateArgument(v, schema.additionalProperties, `${path}.${key}`);
    }
  }
  if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) {
    if (['__proto__', 'constructor', 'prototype'].includes(k)) throw new Error(`${path}: unsafe property`);
    if (!schema.type) validateArgument(v, {}, `${path}.${k}`);
  }
}

export function desktopState() {
  const s = useAppStore.getState();
  return { activeDocumentId: s.activeDocumentId, documents: s.documents.map(d => ({ id:d.id, fileName:d.fileName, filePath:d.filePath, isModified:d.isModified })),
    schedule:{...s.schedule,pdfWorkspace:s.schedule.pdfWorkspace?{...s.schedule.pdfWorkspace,sources:s.schedule.pdfWorkspace.sources.map(({dataBase64,...source})=>source)}:undefined}, items:s.items, companyInfo:s.companyInfo, resourceLibrary:s.resourceLibrary, subSheets:s.subSheets,
    offerte:s.offerte, snapshots:s.snapshots.map(({items,schedule,offerte,...metadata})=>metadata), ifcQuantities:s.ifcQuantities, pdfMeasurements:s.pdfMeasurements,
    activeContentTab:s.activeContentTab, activeItemId:s.activeItemId, reportView:s.reportView, gridView:s.gridView,
    canUndo:s.canUndo(), canRedo:s.canRedo() };
}

/** JSON-only action boundary. Dispatches the same store methods used by the UI. */
export async function executeDesktopCommand(action: string, params: Record<string, unknown> = {}): Promise<unknown> {
  const store = useAppStore.getState();
  if (action.startsWith('pricing.')) return (await import('../pricing/priceUpdateCommands')).priceUpdateCommand(action.slice(8), params);
  if (action.startsWith('revisions.')) return (await import('../revisions/revisionCommands')).revisionCommand(action.slice(10), params);
  if (action.startsWith('recovery.')) {
    const recovery = await import('../file/recovery');
    if (action === 'recovery.list') return (await recovery.listRecovery()).map(({ documents, ...record }) => ({ ...record, documents: documents.map(({ fileName }) => ({ fileName })) }));
    if (typeof params.id !== 'string') throw Error('Recovery id is required.');
    if (action === 'recovery.discard') { await recovery.removeRecovery(params.id); return { discarded: true }; }
    if (action === 'recovery.restore') { const record = (await recovery.listRecovery()).find(r => r.id === params.id); if (!record) throw Error('Unknown recovery id.'); return { documentIds: recovery.restoreRecovery(record) }; }
    throw Error('Unknown recovery action.');
  }
  if (action === 'getState') return desktopState();
  if (action === 'listActions') return { ...catalogue, workspaceActions };
  if (action.startsWith('review.')) {
    if (!['review.list', 'review.open', 'review.openItem'].includes(action)) throw Error('Unknown review action');
    const allowed = action === 'review.openItem' ? ['itemId'] : ['category'];
    if (Object.keys(params).some(key => !allowed.includes(key))) throw Error('Unknown review parameter');
    if (params.category !== undefined && !['all', 'price', 'source', 'unit'].includes(params.category as string)) throw Error('Unknown review category');
    const { reviewBudget } = await import('@/services/review/budgetReview');
    const current = useAppStore.getState();
    if (!current.activeDocumentId) throw Error('No active document');
    if (action === 'review.openItem') {
      if (typeof params.itemId !== 'string') throw Error('itemId is required');
      current.openReviewItem(params.itemId);
      return { opened: true, itemId: params.itemId, view: 'grid' };
    }
    if (action === 'review.open') {
      if (params.category !== undefined) current.setReviewFilter(params.category as 'all' | 'price' | 'source' | 'unit');
      current.setActiveSubSheet(null); current.setActiveContentTab('review');
      return { opened: true, view: 'review' };
    }
    const report = reviewBudget(current);
    return { ...report, issues: report.issues.filter(issue => !params.category || params.category === 'all' || issue.category === params.category) };
  }
  if (action === 'workspace.layouts') {
    const { builtinWorkspaceLayouts } = await import('@/state/slices/workspaceSlice');
    return { current: store.activeWorkspaceLayoutId, builtins: builtinWorkspaceLayouts(), saved: store.settings.workspaceLayouts ?? [] };
  }
  if (action === 'workspace.openSecondScreen') {
    await (await import('@/services/workspaces/companion')).openCompanionWindow();
    return { opened: true, readOnly: true };
  }
  if (action === 'quantity.origin' || action === 'quantity.openSource') {
    const item = store.items.find(item => item.id === params.itemId);
    if (!item) throw Error('Unknown itemId');
    if (action === 'quantity.origin') return (await import('@/services/quantity/quantityOrigin')).getQuantityOrigin(item, store);
    if (params.sourceIndex !== undefined && (!Number.isInteger(params.sourceIndex) || Number(params.sourceIndex) < 0)) throw Error('sourceIndex must be a non-negative integer');
    return (await import('@/services/quantity/quantitySourceActions')).openQuantitySource(item.id, params.sourceIndex as number | undefined);
  }
  if (action.startsWith('assistant.')) {
    const proposals = await import('@/services/assistant/assistantProposal');
    if (action === 'assistant.preview') {
      if (!Array.isArray(params.actions)) throw Error('actions must be an array');
      const proposal = proposals.stageAssistantProposal(params.actions);
      return proposals.summarizeAssistantProposal(proposal);
    }
    if (typeof params.proposalId !== 'string') throw Error('proposalId is required');
    if (action === 'assistant.apply') { const proposal = proposals.applyAssistantProposal(params.proposalId); return { applied: true, proposalId: proposal.id, totals: proposal.afterTotals }; }
    if (action === 'assistant.discard') { proposals.discardAssistantProposal(params.proposalId); return { discarded: true }; }
    if (action === 'assistant.undo') { proposals.undoAssistantProposal(params.proposalId); return { undone: true }; }
    throw Error('Unknown assistant action');
  }
  if (action === 'getProject') {
    const p = JSON.parse(serializeProject(store.schedule, store.items, store.companyInfo, {sheets:store.subSheets,activeSheetId:store.activeSubSheetId}, store.offerte, store.snapshots));
    p.resourceLibrary = store.resourceLibrary;
    return p;
  }
  if (action === 'openProject') {
    if (typeof params.json !== 'string') throw new Error('json is required');
    const project = deserializeProject(params.json);
    const id = openProjectInStore(project, String(params.fileName ?? 'MCP-begroting'), typeof params.filePath === 'string' ? params.filePath : null);
    useAppStore.getState().setResourceLibrary(project.resourceLibrary ?? []);
    useAppStore.getState().setSnapshots(project.snapshots ?? []);
    return { documentId: id };
  }
  // File/viewer services are loaded only when used.
  if (action === 'export.pdf' || action === 'export.ifc') {
    const { exportPdf, exportIfc } = await import('./apiExports');
    return { outputPath: await (action === 'export.pdf' ? exportPdf(params) : exportIfc(params)) };
  }
  if (action.startsWith('file.')) return (await import('./fileCommands')).fileCommand(action.slice(5),params);
  if (action.startsWith('pdf.')) return (await import('./workspaceCommands')).pdfCommand(action.slice(4), params);
  if (action.startsWith('ifc.')) return (await import('../ifc/ifcLiteWorkspace')).ifcCommand(action.slice(4), params);
  if (!Object.prototype.hasOwnProperty.call(catalogue.actions, action)) throw new Error(`Unknown action: ${action}. Use app_list_actions.`);
  const spec = (catalogue.actions as Record<string, { parameters: {name:string;optional:boolean;schema:JsonSchema}[] }>)[action];
  for (const key of Object.keys(params)) if (!spec.parameters.some(p => p.name === key)) throw new Error(`Unknown parameter: ${key}`);
  const args = spec.parameters.map(p => {
    const value = params[p.name];
    if (value === undefined && p.optional) return undefined;
    validateArgument(value, p.schema, p.name); return value;
  });
  const fn = (store as unknown as Record<string, unknown>)[action];
  if (typeof fn !== 'function') throw new Error(`Action unavailable in this app version: ${action}`);
  const before = useAppStore.getState();
  try {
    const result = await fn(...args);
    if (action === 'undo' || action === 'redo') { if (Array.isArray(result)) useAppStore.setState({items:recalculateItems(result,store.schedule.tarieven)}); }
    const current = useAppStore.getState();
    // Document navigation restores that document's own history. Treating the
    // newly active rows as an edit would put another document into its undo stack.
    const documentNavigation = ['addDocument', 'removeDocument', 'setActiveDocument', 'openReviewItem'].includes(action);
    if (!documentNavigation && current.items !== before.items && !['undo','redo'].includes(action) && current.undoStack === before.undoStack) current.pushHistory(before.items, `MCP: ${action}`);
    if (!documentNavigation && (current.items !== before.items || current.schedule !== before.schedule || current.offerte !== before.offerte || current.subSheets !== before.subSheets || current.snapshots !== before.snapshots)) {
      if (current.activeDocumentId) current.updateDocument(current.activeDocumentId,{isModified:true});
    }
    return { result:result ?? null, activeDocumentId:current.activeDocumentId };
  } catch(e) { throw new Error(`${action}: ${e instanceof Error ? e.message : String(e)}`); }
}
