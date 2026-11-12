import { describe, it, expect } from 'vitest';
import { reportRequestItems, reportRequestSchedule } from '@/services/print/reportRequest';
import { computeBtwLaagDirect, computeStaartItemBreakdowns } from '@/services/calculation/calculator';
import { createDefaultSchedule } from '@/data/defaultBudget';
import { makeCostItem } from '@/services/importers/core';
import type { CostItem } from '@/types/costModel';

const mk = (p: Partial<CostItem> & Pick<CostItem, 'rowType'>) => makeCostItem(p);

describe('PDF-request uit de rapportvoorvertoning', () => {
  it('stuurt btw-tarief, laag-grondslag en materiaalprijs mee (serde-namen van Rust)', () => {
    const ch = mk({ rowType: 'chapter', description: 'Kozijnen', btwTarief: 'laag' });
    const post = mk({ rowType: 'begrotingspost', parentId: ch.id, depth: 1, quantity: 2, materialPrice: 30, laborPrice: 20 });
    const btwLaag = mk({ rowType: 'staart_btw_laag', staartPercentage: 9, staartBtwBasis: 500 });
    const [c, p, b] = reportRequestItems([ch, post, btwLaag]);
    expect(c.btwTarief).toBe('laag');
    expect(p.materialPrice).toBe(30);
    expect(p.laborPrice).toBe(20);
    expect(b.staartBtwBasis).toBe(500);
    // Afwezig = null (Rust: Option), geen undefined die wegvalt
    expect(p.btwTarief).toBeNull();
  });

  it('stuurt alle regels en de optie "alleen hoofdstuktotalen" mee', () => {
    const schedule = { ...createDefaultSchedule(), reportChapterTotalsOnly: true };
    expect(reportRequestSchedule(schedule).reportChapterTotalsOnly).toBe(true);
    expect(reportRequestSchedule(createDefaultSchedule()).reportChapterTotalsOnly).toBe(false);
    const ch = mk({ rowType: 'chapter' });
    const regel = mk({ rowType: 'regel', parentId: ch.id, depth: 1 });
    expect(reportRequestItems([ch, regel])).toHaveLength(2);
  });
});

// Dezelfde invoer als de Rust-rapporttests (reports/bouw1.rs, ibis.rs, mod.rs):
// de verwachte bedragen daar komen uit deze TS-kern.
describe('TS-kern: verwachte bedragen voor de Rust-rapporttests', () => {
  const staart = (items: CostItem[]) => {
    const out = computeStaartItemBreakdowns(items);
    const by = (rt: string) => out.find(i => i.rowType === rt)!.staartItemBreakdown!;
    // Incl. btw = stand na de laatste btw-regel (de btw rekent na de afronding)
    const btw = out.filter(i => i.rowType.startsWith('staart_btw'));
    return { by, incl: btw[btw.length - 1].staartItemBreakdown!.totaal };
  };
  const arbeid = (total: number, parentId: string | null) =>
    mk({ rowType: 'regel', parentId, depth: parentId ? 1 : 0, total, resourceType: 'arbeid' });

  it('1000 arbeid, ABK 6 %, winst 5 %, btw 21 %', () => {
    const ch = mk({ rowType: 'chapter', total: 1000 });
    const { by, incl } = staart([
      ch, arbeid(1000, ch.id),
      mk({ rowType: 'staart_abk', staartPercentage: 6 }),
      mk({ rowType: 'staart_winst', staartPercentage: 5 }),
      mk({ rowType: 'staart_btw', staartPercentage: 21 }),
    ]);
    expect(by('staart_abk').subtotaal).toBeCloseTo(60);
    expect(by('staart_winst').subtotaal).toBeCloseTo(53);
    expect(by('staart_winst').totaal).toBeCloseTo(1113);
    expect(incl).toBeCloseTo(1346.73);
  });

  it('losse top-level regel telt mee in de ABK-grondslag', () => {
    const ch = mk({ rowType: 'chapter', total: 1000 });
    const { by, incl } = staart([
      ch, arbeid(1000, ch.id), arbeid(500, null),
      mk({ rowType: 'staart_abk', staartPercentage: 6 }),
      mk({ rowType: 'staart_btw', staartPercentage: 21 }),
    ]);
    expect(by('staart_abk').bedrag).toBeCloseTo(1500);
    expect(by('staart_abk').totaal).toBeCloseTo(1590);
    expect(incl).toBeCloseTo(1923.9);
  });

  it('afronding vóór winst volgt de staartvolgorde', () => {
    const ch = mk({ rowType: 'chapter', total: 800 });
    const { by, incl } = staart([
      ch, arbeid(800, ch.id),
      mk({ rowType: 'staart_afronding', staartDoelbedrag: 850 }),
      mk({ rowType: 'staart_winst', staartPercentage: 10 }),
      mk({ rowType: 'staart_btw', staartPercentage: 21 }),
    ]);
    expect(by('staart_afronding').subtotaal).toBeCloseTo(50);
    expect(by('staart_winst').bedrag).toBeCloseTo(850);
    expect(by('staart_winst').totaal).toBeCloseTo(935);
    expect(incl).toBeCloseTo(1131.35);
  });

  it('afronding zonder stap is € 0', () => {
    const ch = mk({ rowType: 'chapter', total: 800 });
    const { by, incl } = staart([
      ch, arbeid(800, ch.id),
      mk({ rowType: 'staart_winst', staartPercentage: 5 }),
      mk({ rowType: 'staart_btw', staartPercentage: 21 }),
      mk({ rowType: 'staart_afronding' }),
    ]);
    expect(by('staart_afronding').subtotaal).toBe(0);
    expect(incl).toBeCloseTo(1016.4);
  });

  it('laag-post met alleen een tekstregel telt met eigen prijs (ownCounts)', () => {
    const ch = mk({ rowType: 'chapter', total: 1000 });
    const post = mk({ rowType: 'begrotingspost', parentId: ch.id, depth: 1, total: 400, btwTarief: 'laag' });
    const tekst = mk({ rowType: 'tekstregel', parentId: post.id, depth: 2, total: 0 });
    const regel = mk({ rowType: 'regel', parentId: ch.id, depth: 1, total: 600 });
    expect(computeBtwLaagDirect([ch, post, tekst, regel])).toBe(400);
    const ch2 = mk({ rowType: 'chapter', total: 50, btwTarief: 'laag' });
    const tekst2 = mk({ rowType: 'tekstregel', parentId: ch2.id, depth: 1, total: 0 });
    expect(computeBtwLaagDirect([ch2, tekst2])).toBe(0);
  });
});
