import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '@/state/appStore';
import { createSiteAppTools, installSiteAppTools } from '@/services/mcp/siteAppTools';
import { createDefaultItems } from '@/data/defaultBudget';

const initial = useAppStore.getState();
const app = createSiteAppTools();
beforeEach(() => { useAppStore.setState(initial, true); });
function open() { useAppStore.getState().addDocument({ id: 'doc', filePath: null, fileName: 'Test', isModified: false, items: createDefaultItems() }); }

describe('site app tools', () => {
  it('installs on the window with its definitions and refuses unknown tools', async () => {
    const target: Parameters<typeof installSiteAppTools>[0] = {};
    installSiteAppTools(target);
    expect(await target.__OPDS_APP__!.tools()).toContain('calc_preview');
    expect((await app.definitions()).every(def => def.description && def.inputSchema)).toBe(true);
    await expect(app.run('calc_nope')).rejects.toThrow('onbekende_tool');
  });
  it('reports no document and creates a new estimate', async () => {
    expect(await app.run('calc_get_budget_summary')).toEqual({ documents: [], activeDocumentId: null });
    await expect(app.run('calc_create_budget_structure', { chapters: [{ description: 'X' }] })).rejects.toThrow('calc_new_budget');
    const made = await app.run('calc_new_budget', { fileName: 'Aanbouw' }) as { fileName: string };
    expect(made.fileName).toBe('Aanbouw');
    expect(useAppStore.getState().documents.map(doc => doc.fileName)).toEqual(['Aanbouw']);
  });
  it('builds a structure in one undo step and recalculates the totals', async () => {
    open();
    const undoBefore = useAppStore.getState().undoStack.length;
    const out = await app.run('calc_create_budget_structure', { chapters: [
      { code: '21', description: 'Fundering', posts: [
        { description: 'Betonwerk', quantity: 1, unit: 'post', rules: [
          { description: 'Beton C30', quantity: 12, unit: 'm3', normUnitPrice: 145, resourceType: 'materiaal' },
          { description: 'Storten', quantity: 8, unit: 'uur', tariefGroep: 'B' },
        ] },
        { description: 'Grondwerk', rules: [{ description: 'Ontgraven', quantity: 30, unit: 'm3', normUnitPrice: 12 }] },
      ] },
      { code: '22', description: 'Ruwbouw' },
    ] }) as { chapters: number; posts: number; rules: number; grandTotal: number };
    expect(out).toMatchObject({ chapters: 2, posts: 2, rules: 3 });
    const state = useAppStore.getState();
    expect(state.undoStack.length).toBe(undoBefore + 1);
    expect(state.documents[0].isModified).toBe(true);
    const beton = state.items.find(item => item.description === 'Beton C30')!;
    expect(beton.total).toBeCloseTo(12 * 145);
    const uren = state.items.find(item => item.description === 'Storten')!;
    expect(uren.total).toBeCloseTo(8 * 46);
    const fundering = state.items.find(item => item.description === 'Fundering')!;
    expect(fundering.total).toBeCloseTo(12 * 145 + 8 * 46 + 30 * 12);
    expect(out.grandTotal).toBeGreaterThan(fundering.total);
    const betonwerk = state.items.find(item => item.description === 'Betonwerk')!;
    expect(beton.nr.startsWith(betonwerk.nr + '.')).toBe(true);
    await app.run('calc_undo');
    expect(useAppStore.getState().items.some(item => item.description === 'Fundering')).toBe(false);
  });
  it('reads rows with filters, limit and without empty columns', async () => {
    open();
    await app.run('calc_create_budget_structure', { chapters: [{ description: 'Fundering', posts: [{ description: 'Beton', rules: [{ description: 'Beton C30', quantity: 2, unit: 'm3', normUnitPrice: 100 }] }] }] });
    const found = await app.run('calc_get_items', { search: 'c30' }) as { total: number; items: Record<string, unknown>[] };
    expect(found.total).toBe(1);
    expect(found.items[0]).toMatchObject({ description: 'Beton C30', total: 200, rowType: 'regel' });
    expect(found.items[0]).not.toHaveProperty('materialPrice');
    const paged = await app.run('calc_get_items', { limit: 1, offset: 1 }) as { total: number; offset: number; items: unknown[] };
    expect(paged.items).toHaveLength(1);
    const summary = await app.run('calc_get_budget_summary') as { chapters: { description: string }[]; breakdown: object };
    expect(summary.chapters.map(chapter => chapter.description)).toContain('Fundering');
    expect(summary.breakdown).toHaveProperty('aanneemsomAfgerond');
  });
  it('previews without changing, and applies on request', async () => {
    open();
    await app.run('calc_create_budget_structure', { chapters: [{ description: 'Fundering', posts: [{ description: 'Beton', rules: [{ description: 'Beton C30', quantity: 2, unit: 'm3', normUnitPrice: 100 }] }] }] });
    const row = () => useAppStore.getState().items.find(item => item.description === 'Beton C30')!;
    const nr = row().nr;
    const shown = await app.run('calc_preview', { actions: [{ type: 'update', nr, veld: 'aantal', waarde: 5 }] }) as { applied: boolean; proposalId: string; changes: { total: number }[] };
    expect(shown.applied).toBe(false);
    expect(row().quantity).toBe(2);
    expect(shown.changes[0].total).toBe(500);
    await app.run('calc_apply', { proposalId: shown.proposalId });
    expect(row().quantity).toBe(5);
    const direct = await app.run('calc_preview', { actions: [{ type: 'update', nr, veld: 'aantal', waarde: 7 }], apply: true }) as { applied: boolean };
    expect(direct.applied).toBe(true);
    expect(row().quantity).toBe(7);
    const wrong = await app.run('calc_preview', { actions: [{ type: 'verwijder', nr: '99.99' }], apply: true }) as { applied: boolean; errors: string[] };
    expect(wrong.applied).toBe(false);
    expect(wrong.errors.length).toBeGreaterThan(0);
  });
  it('checks the arguments against the schema', async () => {
    await expect(app.run('calc_get_items', { onbekend: 1 })).rejects.toThrow('unknown field');
    await expect(app.run('calc_preview', {})).rejects.toThrow('required');
  });
  it('lists the catalogue in small pieces and hides what needs the desktop', async () => {
    const groups = await app.run('calc_list_actions') as { groups: Record<string, number> };
    expect(groups.groups.Offerte).toBeGreaterThan(0);
    expect(groups.groups.Accounts).toBeUndefined();
    const found = await app.run('calc_list_actions', { search: 'subsheet cell' }) as { actions: { name: string }[] };
    expect(found.actions.map(action => action.name)).toContain('setSubSheetCell');
    const one = await app.run('calc_list_actions', { action: 'setSubSheetCell' }) as { parameters: unknown[] };
    expect(one.parameters.length).toBe(3);
    await expect(app.run('calc_list_actions', { action: 'export.pdf' })).rejects.toThrow('niet_in_browser');
  });
  it('runs store actions and refuses desktop-only ones', async () => {
    open();
    const sheet = await app.run('calc_action', { action: 'addSubSheet', params: { name: 'Hoeveelheden' } }) as { result: string };
    await app.run('calc_action', { action: 'setSubSheetCell', params: { sheetId: sheet.result, cellRef: 'A1', value: '3' } });
    expect(useAppStore.getState().subSheets[0].cells.A1.value).toBe('3');
    for (const action of ['file.export', 'export.pdf', 'recovery.list', 'workspace.openSecondScreen']) {
      await expect(app.run('calc_action', { action })).rejects.toThrow('niet_in_browser');
    }
  });
  it('refuses an answer that would flood the model', async () => {
    open();
    const many = Array.from({ length: 2000 }, (_, index) => ({ ...createDefaultItems()[0], id: String(index), description: 'x'.repeat(100) }));
    useAppStore.setState({ items: many });
    await expect(app.run('calc_action', { action: 'getState' })).rejects.toThrow('te_groot');
    expect(await app.run('calc_get_items', { limit: 10 })).toHaveProperty('total', 2000);
  });
});
