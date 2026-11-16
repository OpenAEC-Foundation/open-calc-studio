import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '@/state/appStore';
import { getGrandTotal } from '@/services/calculation/calculator';
import { variantCalculatedItems } from '@/services/grid/variantTotals';
import { handleApiExport } from '@/services/mcp/apiExports';
import { buildOfferteRequest } from '@/services/offerte/offerteRequest';
import { generatePrintHtml } from '@/services/print/printService';
import { generateReport } from '@/services/report/reportGenerator';
import type { CostItem } from '@/types/costModel';
import { makeCostItem } from '@/services/importers/core';

// Knownbug 165: rapporten en afdrukken namen regels uit een niet-gekozen
// variant mee, terwijl grid en statusbalk ze weglaten. De PDF-request (Rust),
// de offerte-request en de HTML-afdrukken moeten dezelfde regels en totalen
// gebruiken als de statusbalk (`getGrandTotal(variantCalculatedItems(...))`).

const invoke = vi.fn(async (..._args: unknown[]): Promise<unknown> => undefined);
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a) }));
vi.mock('@tauri-apps/api/path', () => ({ tempDir: async () => 'C:/tmp', join: async (...p: string[]) => p.join('/') }));

const initial = useAppStore.getState();
const s = () => useAppStore.getState();
let altRow: string;

const variants = (active: string | undefined) => s().setSchedule({ branchesEnabled: true, activeBranchId: active,
  branches: [{ id: 'main', parentId: null, name: 'Main' }, { id: 'alt', parentId: 'main', name: 'Alternative' }] });
const statusBarTotal = () => getGrandTotal(variantCalculatedItems(s().items, s().schedule));
const pdfRequestItems = async (view: string): Promise<CostItem[]> => {
  invoke.mockClear();
  await handleApiExport('export_pdf_request', { reportView: view, outputPath: 'C:/uit/r.pdf' });
  const call = invoke.mock.calls.find(c => c[0] === 'generate_pdf_report' || c[0] === 'generate_ibis_report');
  return (call![1] as { request: { items: CostItem[] } }).request.items;
};

beforeAll(() => {
  const { settings, setSettings } = useAppStore.getState();
  setSettings({ ...settings, reportLocale: 'nl' });
});

beforeEach(() => {
  useAppStore.setState(initial, true);
  const { settings, setSettings } = useAppStore.getState();
  setSettings({ ...settings, reportLocale: 'nl' });
  s().addDocument({ id: 'bug-165', items: [] });
  const chapter = s().addChapter(null);
  s().updateItem(chapter, 'description', 'Hoofdstuk');
  const post = s().addItem(chapter);
  s().updateItem(post, 'description', 'Wand');
  s().updateItem(post, 'quantity', 1);
  const base = s().addRegel(post);
  s().updateItem(base, 'description', 'BasisRegel');
  s().updateItem(base, 'quantity', 2); s().updateItem(base, 'normUnitPrice', 100);
  altRow = s().addRegel(post);
  s().updateItem(altRow, 'description', 'AlleenInAlt');
  s().updateItem(altRow, 'quantity', 3); s().updateItem(altRow, 'normUnitPrice', 1000);
  s().updateItem(altRow, 'branchId', 'alt');
});

describe('knownbug 165 — reports follow the chosen variant', () => {
  it('the PDF request for Rust leaves out the other variant and totals like the status bar', async () => {
    variants('main');
    expect(statusBarTotal()).toBeLessThan(getGrandTotal(s().items));
    for (const view of ['bouw1', 'hoofdaanneming', 'ibis']) {
      const items = await pdfRequestItems(view);
      expect(items.some(item => item.id === altRow)).toBe(false);
      expect(getGrandTotal(items)).toBeCloseTo(statusBarTotal(), 6);
    }
  });

  it('the quotation request leaves out the other variant', () => {
    variants('main');
    const { items } = buildOfferteRequest(s());
    expect(items.some(item => item.id === altRow)).toBe(false);
    expect(items.filter(item => item.parentId === null).reduce((sum, item) => sum + item.total, 0)).toBeCloseTo(statusBarTotal(), 6);
  });

  it('the Bouw 1 print and the HTML report show only the chosen variant', async () => {
    variants('main');
    const bouw1 = await generatePrintHtml(s().schedule, s().items, 'bouw1');
    expect(bouw1).toContain('BasisRegel');
    expect(bouw1).not.toContain('AlleenInAlt');
    expect(bouw1).not.toContain('3.200,00');
    expect(bouw1).toContain('200,00');
    const report = generateReport(s().schedule, s().items);
    expect(report).not.toContain('AlleenInAlt');
    expect(report).not.toContain('3.200,00');
  });

  it('with the other variant chosen, its row is in the reports again', async () => {
    variants('alt');
    const items = await pdfRequestItems('bouw1');
    expect(items.some(item => item.id === altRow)).toBe(true);
    expect(getGrandTotal(items)).toBeCloseTo(statusBarTotal(), 6);
    expect(await generatePrintHtml(s().schedule, s().items, 'bouw1')).toContain('AlleenInAlt');
  });

  it('without a chosen variant (all variants) nothing changes: every row goes along', async () => {
    variants(undefined);
    const items = await pdfRequestItems('bouw1');
    expect(items).toHaveLength(s().items.length);
    expect(items.map(item => item.total)).toEqual(s().items.map(item => item.total));
    expect(buildOfferteRequest(s()).items).toHaveLength(s().items.length);
    expect(await generatePrintHtml(s().schedule, s().items, 'bouw1')).toContain('AlleenInAlt');
  });
  it('a staart row stays in the PDF request and is computed over the chosen variant only', async () => {
    variants('main');
    const ak = makeCostItem({ rowType: 'staart_ak', description: 'AK', staartPercentage: 10, sortOrder: 9999 });
    s().setItems([...s().items, ak]);
    const staart = (items: CostItem[]) => items.find(item => item.id === ak.id)!.total;
    const scoped = staart(variantCalculatedItems(s().items, s().schedule));
    expect(scoped).toBeGreaterThan(0);
    expect(scoped).toBeLessThan(staart(s().items));
    const items = await pdfRequestItems('bouw1');
    expect(staart(items)).toBeCloseTo(scoped, 6);
    expect(getGrandTotal(items)).toBeCloseTo(statusBarTotal(), 6);
  });

});
