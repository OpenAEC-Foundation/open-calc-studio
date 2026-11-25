import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generatePrintHtml } from '@/services/print/printService';
import { buildBouw1Html } from '@/services/print/bouw1PrintService';
import { createDefaultItems, createDefaultSchedule } from '@/data/defaultBudget';
import { getStaartBreakdown, recalculateItems } from '@/services/calculation/calculator';
import { makeCostItem } from '@/services/importers/core';
import { makeReportContext } from '@/i18n/reportI18n';
import type { CompanyInfo, CostItem } from '@/types/costModel';
import { useAppStore } from '@/state/appStore';

// Nederlandse rapportteksten en -notatie, zoals in bouw1PrintSummary.test.ts.
const oldTz = process.env.TZ;
beforeAll(() => {
  process.env.TZ = 'Europe/Amsterdam';
  const { settings, setSettings } = useAppStore.getState();
  setSettings({ ...settings, reportLocale: 'nl' });
});
afterAll(() => { process.env.TZ = oldTz; });

const nl = () => makeReportContext('nl');
function mkSchedule(extra: Record<string, unknown> = {}) {
  return { ...createDefaultSchedule(), name: 'Testbegroting', projectName: 'Testproject', ...extra };
}

/** Hoofdstuk 01 met één post van 10 × 80 = 800. */
function chapterWithPost(): CostItem[] {
  const ch = makeCostItem({ parentId: null, sortOrder: 0, depth: 0, rowType: 'chapter', code: '01', description: 'Grondwerk' });
  const post = makeCostItem({ parentId: ch.id, sortOrder: 0, depth: 1, rowType: 'begrotingspost', code: '01.01', description: 'Ontgraven', unit: 'm³', quantity: 10 });
  const regel = makeCostItem({ parentId: post.id, sortOrder: 0, depth: 2, rowType: 'regel', code: '01.01.01', description: 'Graafmachine', unit: 'uur', quantity: 1, normUnitPrice: 80, resourceType: 'materieel' });
  return [ch, post, regel];
}

describe('rapporten en afdrukken (knownbugs 122, 125, 126, 128, 129)', () => {
  it('122: hoofdaanneming met alleen hoofdstuktotalen toont het bedrag op de hoofdstukregel', async () => {
    const items = recalculateItems(chapterWithPost());
    const total = items[0].total;
    expect(total).toBeGreaterThan(0);
    const html = await generatePrintHtml(mkSchedule({ reportChapterTotalsOnly: true }), items, 'hoofdaanneming');
    const chapterRow = /<tr class="chapter-row[^"]*">([\s\S]*?)<\/tr>/.exec(html)![1];
    const amount = new Intl.NumberFormat('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(total);
    expect(chapterRow).toContain(amount);
  });

  it('122: zonder die optie blijft het bedrag bij hoofdaanneming in het subtotaal (niet op de hoofdstukregel)', async () => {
    const items = recalculateItems(chapterWithPost());
    const html = await generatePrintHtml(mkSchedule(), items, 'hoofdaanneming');
    const chapterRow = /<tr class="chapter-row[^"]*">([\s\S]*?)<\/tr>/.exec(html)![1];
    expect(chapterRow).toContain('<td class="amount"></td>');
    expect(html).toContain('subtotal-row');
  });

  it('125: percentages in de Bouw 1-samenvatting volgen de rapporttaal (0,5 % in het Nederlands)', () => {
    const html = buildBouw1Html(mkSchedule(), recalculateItems(createDefaultItems()), false, undefined, undefined, nl());
    expect(html).toContain('0,5 %');
    expect(html).not.toContain('0.5 %');
  });

  it('126: de webafdruk gebruikt de ingestelde rapportdatum, als lokale datum', async () => {
    const schedule = mkSchedule({ reportDate: '2026-03-04' });
    const items = recalculateItems(chapterWithPost());
    const html = await generatePrintHtml(schedule, items, 'hoofdaanneming');
    expect(html).toContain('04-03-2026');
    const bouw1 = buildBouw1Html(schedule, items, false, undefined, undefined, nl());
    expect(bouw1).toContain('04-03-2026');
  });

  it('128: de Bouw 1-samenvatting toont de opslagen oude stijl (BasCalc) en telt ze mee', () => {
    const staart = (rowType: CostItem['rowType'], description: string, pct: number, sortOrder: number) =>
      makeCostItem({ parentId: null, sortOrder, depth: 0, rowType, description, staartPercentage: pct, quantity: pct });
    const items = recalculateItems([
      ...chapterWithPost(),
      staart('staart_ukk', 'Uitvoeringskosten XYZ', 10, 90),
      staart('staart_ak', 'Algemene kosten XYZ', 5, 91),
      staart('staart_wr', 'Winst en risico XYZ', 8, 92),
      staart('staart_btw', 'BTW', 21, 93),
    ]);
    const bd = getStaartBreakdown(items);
    expect(bd.ukkAmount).toBeGreaterThan(0);
    expect(bd.akAmount).toBeGreaterThan(0);
    expect(bd.wrAmount).toBeGreaterThan(0);
    const html = buildBouw1Html(mkSchedule(), items, false, undefined, undefined, nl());
    expect(html).toContain('Uitvoeringskosten XYZ');
    expect(html).toContain('Algemene kosten XYZ');
    expect(html).toContain('Winst en risico XYZ');
    const nf = new Intl.NumberFormat('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    // Totaal excl. btw = kostprijs + ukk + ak + wr, zoals in het grid
    expect(html).toContain(nf.format(bd.aanneemsom + bd.afronding));
    expect(html).toContain(nf.format(bd.aanneemsomAfgerond));
  });

  it('129: de Bouw 1 HTML-afdruk toont het linker logo van de gebruiker', async () => {
    const logo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';
    const companyInfo = { name: 'Test BV', logoLeft: logo, logoRight: '' } as CompanyInfo;
    const items = recalculateItems(chapterWithPost());
    const html = await generatePrintHtml(mkSchedule(), items, 'bouw1', true, companyInfo);
    expect(html).toContain(`<img src="${logo}" class="company-logo"`);
    // Zonder logo blijft de bedrijfsnaam staan
    const plain = await generatePrintHtml(mkSchedule(), items, 'bouw1', true, { ...companyInfo, logoLeft: '' });
    expect(plain).toContain('company-name-large');
  });
});
