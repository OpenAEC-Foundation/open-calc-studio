import { describe, it, expect, afterEach } from 'vitest';
import { generatePrintHtml, cssPageCounter } from '@/services/print/printService';
import { buildBouw1Html } from '@/services/print/bouw1PrintService';
import { generateReport } from '@/services/report/reportGenerator';
import { getReportLabels, getReportRequestLocale, makeReportContext, reportNumberFormat, resolveReportLanguage } from '@/i18n/reportI18n';
import { createDefaultSchedule, createDefaultItems } from '@/data/defaultBudget';
import { recalculateItems } from '@/services/calculation/calculator';
import { makeCostItem } from '@/services/importers/core';
import { useAppStore } from '@/state/appStore';
import i18next from '@/i18n/config';
import enReport from '@/i18n/locales/en/report.json';
import nlReport from '@/i18n/locales/nl/report.json';

/**
 * Rapporttaal: afdrukken en PDF-rapporten volgen een eigen instelling
 * (`reportLocale`), standaard gelijk aan de interfacetaal.
 */
const schedule = () => ({ ...createDefaultSchedule(), name: 'Test', projectName: 'Testproject', client: 'Gemeente', status: 'DRAFT' as const });

function sampleItems() {
  const h1 = makeCostItem({ rowType: 'chapter', code: '1', description: 'GRONDWERK', depth: 0, sortOrder: 0 });
  const p = makeCostItem({ rowType: 'chapter', code: '100', description: 'Ontgraven', depth: 1, parentId: h1.id, sortOrder: 1 });
  const post = makeCostItem({
    rowType: 'begrotingspost', code: '100010', description: 'Graafwerk', depth: 2,
    parentId: p.id, quantity: 8, unit: 'uur', unitPrice: 290, total: 2320, sortOrder: 2,
  });
  p.total = 2320;
  h1.total = 2320;
  return [h1, p, post];
}

function setReportLocale(reportLocale: string) {
  const { settings, setSettings } = useAppStore.getState();
  setSettings({ ...settings, reportLocale });
}

function flatKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? flatKeys(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

afterEach(() => setReportLocale('auto'));

describe('rapporttaal in de HTML-print', () => {
  it("rapporttaal 'en' geeft Engelse kopjes, totaalregels, eenheden en getallen", async () => {
    const html = await generatePrintHtml(schedule(), sampleItems(), 'hoofdaanneming', true, undefined, undefined, 'landscape', 'A4', 'en');
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('>Description</th>');
    expect(html).toContain('>Quantity</th>');
    expect(html).toContain('>Amount</th>');
    expect(html).toContain('Total excl. VAT');
    expect(html).toContain('>Subtotal<');
    expect(html).toContain('Main contract');
    expect(html).toContain('Client:');
    expect(html).toContain('"Page " counter(page) " / " counter(pages)');
    // Eenheid 'uur' in de rapporttaal, Engelse getalnotatie
    expect(html).toMatch(/<td class="center">h<\/td>/);
    expect(html).toContain('2,320.00');
    // Geen Nederlandse kopjes of totaalregels meer
    expect(html).not.toContain('Omschrijving');
    expect(html).not.toContain('Hoeveelheid');
    expect(html).not.toContain('Totaal excl. BTW');
  });

  it("rapporttaal 'nl' geeft de Nederlandse kopjes en totaalregels", async () => {
    const html = await generatePrintHtml(schedule(), sampleItems(), 'hoofdaanneming', true, undefined, undefined, 'landscape', 'A4', 'nl');
    expect(html).toContain('<html lang="nl">');
    expect(html).toContain('>Omschrijving</th>');
    expect(html).toContain('>Hoeveelheid</th>');
    expect(html).toContain('>Bedrag</th>');
    expect(html).toContain('Totaal excl. BTW');
    expect(html).toContain('>Subtotaal<');
    expect(html).toContain('Opdrachtgever:');
    expect(html).toContain('"Pagina " counter(page) " / " counter(pages)');
    expect(html).toMatch(/<td class="center">uur<\/td>/);
    expect(html).toContain('2.320,00');
    expect(html).not.toContain('Description');
  });

  it('volgt de instelling reportLocale, los van de interfacetaal', async () => {
    await i18next.changeLanguage('en');
    setReportLocale('nl');
    expect(resolveReportLanguage()).toBe('nl');
    const html = await generatePrintHtml(schedule(), sampleItems(), 'inschrijfstaat');
    expect(html).toContain('Inschrijfstaat');
    expect(html).toContain('>Eenheidsprijs</th>');
  });

  it('"auto" volgt de interfacetaal', async () => {
    setReportLocale('auto');
    await i18next.changeLanguage('nl');
    expect(resolveReportLanguage()).toBe('nl');
    await i18next.changeLanguage('en');
    expect(resolveReportLanguage()).toBe('en');
    const html = await generatePrintHtml(schedule(), sampleItems(), 'werkbeschrijving');
    expect(html).toContain('Work description');
  });

  it('Bouw 1-samenvatting en het begrotingsrapport volgen de rapporttaal', () => {
    const items = recalculateItems(createDefaultItems());
    const en = buildBouw1Html(schedule(), items, false, undefined, undefined, makeReportContext('en'));
    expect(en).toContain('General overhead:');
    expect(en).toContain('Total price incl. VAT:');
    expect(en).not.toContain('Algemene bedrijfskosten');
    const nl = buildBouw1Html(schedule(), items, false, undefined, undefined, makeReportContext('nl'));
    expect(nl).toContain('Algemene bedrijfskosten:');
    expect(nl).toContain('Totaalprijs incl. btw.:');

    const rep = generateReport(schedule(), sampleItems(), makeReportContext('en'));
    expect(rep).toContain('Detailed specification');
    expect(rep).toContain('Status: Draft');
  });
});

describe('rapportlabels voor de Rust/Typst-generators', () => {
  it('bevat de report-namespace plat en de eenheden als units.<code>', async () => {
    const en = await getReportLabels('en');
    expect(en['totals.contractSumExclVat']).toBe('Contract sum excl. VAT');
    expect(en['footer.page']).toBe('Page {{page}} / {{total}}');
    expect(en['units.uur']).toBe('h');

    const nl = await getReportLabels('nl');
    expect(nl['totals.contractSumExclVat']).toBe('Aanneemsom excl. BTW');
    expect(nl['summary.columnTotals']).toBe('Totaal kolommen:');
    expect(nl['units.uur']).toBe('uur');
  });

  it('valt voor een taal zonder rapportvertaling terug op Engels', async () => {
    const xx = await getReportLabels('sw');
    const en = await getReportLabels('en');
    for (const key of Object.keys(en)) expect(xx[key]).toBeTruthy();
  });

  it('leidt de getalnotatie per rapporttaal af (numberFormat)', () => {
    // Nederlands = de standaard van de Rust-kant (numfmt.rs)
    expect(reportNumberFormat('nl-NL')).toEqual({
      decimal: ',', group: '.', grouping: [3], minGroupingDigits: 1, minus: '-',
      currency: '€\u00A0{{n}}', currencyNegative: '€\u00A0-{{n}}', percent: '{{n}}%', date: 'DD-MM-YYYY',
    });
    const en = reportNumberFormat('en-GB');
    expect([en.decimal, en.group, en.currency, en.currencyNegative, en.date]).toEqual(['.', ',', '€{{n}}', '-€{{n}}', 'DD/MM/YYYY']);
    // Spaans: "1234" maar "12.345", bedrag achter het getal
    const es = reportNumberFormat('es');
    expect([es.decimal, es.group, es.minGroupingDigits, es.currency]).toEqual([',', '.', 2, '{{n}}\u00A0€']);
    // Frans: smalle spatie wordt een harde spatie
    expect(reportNumberFormat('fr').group).toBe('\u00A0');
    // Indiase groepering en Latijnse cijfers
    expect(reportNumberFormat('hi').grouping).toEqual([3, 2]);
    // Geen richtingstekens (RLM/ALM) in de patronen voor Arabisch en Hebreeuws
    for (const lang of ['ar', 'he', 'fa']) {
      const f = reportNumberFormat(lang);
      expect(JSON.stringify(f)).not.toMatch(/[\u200E\u200F\u061C\u202A-\u202E\u2066-\u2069]/);
      expect(f.date).toMatch(/DD|MM|YYYY/);
    }
    // Altijd het €-teken, ook waar de locale "EUR" schrijft
    expect(reportNumberFormat('hu').currency).toContain('€');
  });

  it('getReportRequestLocale levert labels én notatie in de rapporttaal', async () => {
    const es = await getReportRequestLocale('es');
    expect(es.numberFormat.date).toBe('DD/MM/YYYY');
    expect(es.labels['units.uur']).toBe('h');
  });

  it('en- en nl-report.json hebben exact dezelfde keys', () => {
    expect(flatKeys(nlReport).sort()).toEqual(flatKeys(enReport).sort());
  });

  it('cssPageCounter zet {{page}}/{{total}} om naar CSS-counters', () => {
    expect(cssPageCounter('Página {{page}} de {{total}}')).toBe('"Página " counter(page) " de " counter(pages)');
    expect(cssPageCounter('{{page}}/{{total}}')).toBe('counter(page) "/" counter(pages)');
  });
});
