import { describe, it, expect } from 'vitest';
import { itemsForReport, generatePrintHtml } from '@/services/print/printService';
import { createDefaultSchedule } from '@/data/defaultBudget';
import { makeCostItem } from '@/services/importers/core';
import type { CompanyInfo } from '@/types/costModel';

// i18next is hier niet geïnitialiseerd; geef de naamvelden expliciet mee.
function mkSchedule(extra: Record<string, unknown> = {}) {
  return { ...createDefaultSchedule(), name: 'Testbegroting', projectName: 'Testproject', ...extra };
}

function sample() {
  const ch = makeCostItem({ parentId: null, sortOrder: 0, depth: 0, rowType: 'chapter', code: '01', description: 'Grondwerk' });
  const post = makeCostItem({ parentId: ch.id, sortOrder: 0, depth: 1, rowType: 'begrotingspost', code: '01.01', description: 'Ontgraven', unit: 'm³', quantity: 10 });
  const regel = makeCostItem({ parentId: post.id, sortOrder: 0, depth: 2, rowType: 'regel', code: '01.01.01', description: 'Graafmachine', unit: 'uur', quantity: 8, normUnitPrice: 80 });
  const staart = makeCostItem({ parentId: null, sortOrder: 99, depth: 0, rowType: 'staart_afronding', description: 'Afronding' });
  return [ch, post, regel, staart];
}

describe('itemsForReport — alleen subtotaal per hoofdstuk', () => {
  it('zonder vinkje: alles blijft', () => {
    const schedule = mkSchedule();
    const items = sample();
    expect(itemsForReport(schedule, items)).toHaveLength(4);
  });

  it('met vinkje: alleen hoofdstukken en staart', () => {
    const schedule = mkSchedule({ reportChapterTotalsOnly: true });
    const result = itemsForReport(schedule, sample());
    expect(result.map(i => i.rowType)).toEqual(['chapter', 'staart_afronding']);
  });
});

describe('rapportkop-logo in de HTML-print', () => {
  const logo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';

  it('logoRight rendert als vaste koptekst-afbeelding rechtsboven', () => {
    const schedule = mkSchedule();
    const companyInfo = { name: 'Test BV', logoRight: logo } as CompanyInfo;
    const html = generatePrintHtml(schedule, sample(), 'hoofdaanneming', true, companyInfo);
    expect(html).toContain('<img class="report-logo-right"');
    expect(html).toContain(logo);
  });

  it('zonder logo geen logo-element', () => {
    const schedule = mkSchedule();
    const html = generatePrintHtml(schedule, sample(), 'hoofdaanneming', true, { name: 'Test BV', logoRight: '' } as CompanyInfo);
    expect(html).not.toContain('<img class="report-logo-right"');
  });

  it('vinkje filtert posten en regels uit de print', () => {
    const schedule = mkSchedule({ reportChapterTotalsOnly: true });
    const html = generatePrintHtml(schedule, sample(), 'hoofdaanneming', true);
    expect(html).toContain('Grondwerk');
    expect(html).not.toContain('Graafmachine');
  });
});
