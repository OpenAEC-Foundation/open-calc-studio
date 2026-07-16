import { describe, it, expect } from 'vitest';
import { generatePrintHtml } from '@/services/print/printService';
import { createDefaultSchedule } from '@/data/defaultBudget';
import { makeCostItem } from '@/services/importers/core';
import type { CostItem } from '@/types/costModel';

/**
 * Clean besteksopmaak in de HTML-print (spiegel van de Rust/PDF-weergave):
 * werkbeschrijving met tekstregels, hoofdaanneming met een subtotaal per
 * paragraaf (het hoofdstuk dat de posten direct bevat).
 */
function sampleItems(): CostItem[] {
  const h1 = makeCostItem({ rowType: 'chapter', code: '1', description: 'VOORBEREIDEND', depth: 0, sortOrder: 0 });
  const p100 = makeCostItem({ rowType: 'chapter', code: '100', description: 'BODEMONDERZOEK', depth: 1, parentId: h1.id, sortOrder: 1 });
  const a1 = makeCostItem({
    rowType: 'begrotingspost', code: '100010', description: 'Verkennend onderzoek', depth: 2,
    parentId: p100.id, quantity: 1, unit: 'keer', unitPrice: 1920, total: 1920, verrekenbaar: 'N', sortOrder: 2,
  });
  const opm = makeCostItem({ rowType: 'tekstregel', code: 'opm', description: 'Toelichting bij de post', depth: 3, parentId: a1.id, sortOrder: 3 });
  const p200 = makeCostItem({ rowType: 'chapter', code: '200', description: 'GRONDWERK PARAGRAAF', depth: 1, parentId: h1.id, sortOrder: 4 });
  const b1 = makeCostItem({
    rowType: 'begrotingspost', code: '200010', description: 'Ontgraven', depth: 2,
    parentId: p200.id, quantity: 10, unit: 'm³', unitPrice: 40, total: 400, verrekenbaar: 'V', sortOrder: 5,
  });
  // Paragraaf-totalen zoals de calculator ze zou zetten
  p100.total = 1920;
  p200.total = 400;
  h1.total = 2320;
  return [h1, p100, a1, opm, p200, b1];
}

const schedule = () => ({ ...createDefaultSchedule(), name: 'Test', projectName: 'Test' });

describe('Clean besteksopmaak (HTML-print)', () => {
  it('werkbeschrijving bevat tekstregels (opm) en V/N per post', () => {
    const html = generatePrintHtml(schedule(), sampleItems(), 'werkbeschrijving');
    expect(html).toContain('Toelichting bij de post');
    // V/N op de postregel (S-kolom), niet alleen op hoofdstukken
    expect(html).toMatch(/Verkennend onderzoek[\s\S]*?<td class="center">N<\/td>/);
  });

  it('hoofdaanneming heeft een subtotaal per paragraaf', () => {
    const html = generatePrintHtml(schedule(), sampleItems(), 'hoofdaanneming');
    const subtotals = html.match(/>Subtotaal</g) ?? [];
    // Twee paragrafen met posten → twee subtotalen
    expect(subtotals.length).toBe(2);
    expect(html).toContain('1.920,00');
    expect(html).toContain('400,00');
  });

  it('hoofdaanneming toont het hoofdstuktotaal alleen in de totaalregel', () => {
    const html = generatePrintHtml(schedule(), sampleItems(), 'hoofdaanneming');
    // 2.320,00 hoort exact één keer voor te komen: in "Totaal excl. BTW" —
    // niet ook nog eens naast de hoofdstukregel.
    const hits = html.match(/2\.320,00/g) ?? [];
    expect(hits.length).toBe(1);
    expect(html).toMatch(/Totaal excl\. BTW[\s\S]{0,120}2\.320,00/);
  });
});
