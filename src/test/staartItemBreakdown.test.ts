import { describe, it, expect } from 'vitest';
import { computeStaartItemBreakdowns, recalculateItems } from '@/services/calculation/calculator';
import type { CostItem } from '@/types/costModel';

function mkRegel(rt: string, total: number): CostItem {
  return {
    id: crypto.randomUUID(), parentId: null, sortOrder: 0,
    code: '', description: '', unit: 'st', quantity: 1,
    materialPrice: null, laborPrice: null, unitPrice: total, total,
    isCollapsed: false, depth: 2, notes: '', ifcGuid: '',
    rowType: 'regel', staartPercentage: null, nr: '',
    normQuantity: null, normFactor: null, normDivisor: null, normUnitPrice: null,
    resourceType: rt as any, resourceLibraryId: null,
    verrekenbaar: null, tariefGroep: null,
  };
}

function mkStaart(rt: string, pct: number | null): CostItem {
  return {
    id: crypto.randomUUID(), parentId: null, sortOrder: 100,
    code: '', description: rt, unit: '%', quantity: pct,
    materialPrice: null, laborPrice: null, unitPrice: 0, total: 0,
    isCollapsed: false, depth: 0, notes: '', ifcGuid: '',
    rowType: rt as any, staartPercentage: pct, nr: '',
    normQuantity: null, normFactor: null, normDivisor: null, normUnitPrice: null,
    resourceType: null, resourceLibraryId: null,
    verrekenbaar: null, tariefGroep: null,
  };
}

describe('computeStaartItemBreakdowns', () => {
  it('empty budget: all staart breakdowns zero', () => {
    const items: CostItem[] = [
      mkStaart('staart_ak_oa', 9),
      mkStaart('staart_btw', 21),
      mkStaart('staart_afronding', null),
    ];
    const result = computeStaartItemBreakdowns(items);
    const akoa = result.find(i => i.rowType === 'staart_ak_oa');
    expect(akoa?.staartItemBreakdown?.subtotaal).toBe(0);
    expect(akoa?.staartItemBreakdown?.totaal).toBe(0);
    const btw = result.find(i => i.rowType === 'staart_btw');
    expect(btw?.staartItemBreakdown?.subtotaal).toBe(0);
  });

  it('AK over OA = 9% of onderaanneming-kolom', () => {
    const items: CostItem[] = [
      mkRegel('onderaannemer', 100000),
      mkStaart('staart_ak_oa', 9),
    ];
    const result = computeStaartItemBreakdowns(items);
    const akoa = result.find(i => i.rowType === 'staart_ak_oa');
    expect(akoa?.staartItemBreakdown?.onderaanneming).toBeCloseTo(9000, 2);
    expect(akoa?.staartItemBreakdown?.subtotaal).toBeCloseTo(9000, 2);
  });

  it('ABK = 6% of (loon + materiaal + materieel)', () => {
    const items: CostItem[] = [
      mkRegel('arbeid', 50000),
      mkRegel('materiaal', 30000),
      mkRegel('materieel', 20000),
      mkRegel('onderaannemer', 100000),
      mkStaart('staart_abk', 6),
    ];
    const result = computeStaartItemBreakdowns(items);
    const abk = result.find(i => i.rowType === 'staart_abk');
    // 6% of (50000+30000+20000) = 6% of 100000 = 6000
    expect(abk?.staartItemBreakdown?.subtotaal).toBeCloseTo(6000, 2);
    expect(abk?.staartItemBreakdown?.loon).toBeCloseTo(3000, 2);
    expect(abk?.staartItemBreakdown?.materiaal).toBeCloseTo(1800, 2);
    expect(abk?.staartItemBreakdown?.materieel).toBeCloseTo(1200, 2);
    expect(abk?.staartItemBreakdown?.onderaanneming).toBe(0);
  });

  it('Risico = 3% of cumulative-up-to-here', () => {
    const items: CostItem[] = [
      mkRegel('arbeid', 100000),
      mkStaart('staart_risico', 3),
    ];
    const result = computeStaartItemBreakdowns(items);
    const r = result.find(i => i.rowType === 'staart_risico');
    expect(r?.staartItemBreakdown?.bedrag).toBeCloseTo(100000, 2);
    expect(r?.staartItemBreakdown?.subtotaal).toBeCloseTo(3000, 2);
  });

  it('BTW 21% on aanneemsom excl', () => {
    const items: CostItem[] = [
      mkRegel('arbeid', 100000),
      mkStaart('staart_btw', 21),
    ];
    const result = computeStaartItemBreakdowns(items);
    const btw = result.find(i => i.rowType === 'staart_btw');
    expect(btw?.staartItemBreakdown?.subtotaal).toBeCloseTo(21000, 2);
    expect(btw?.staartItemBreakdown?.totaal).toBeCloseTo(121000, 2);
  });

  it('afronding werkt op het excl-bedrag; btw rekent over het afgeronde excl', () => {
    // De afronding hoort bij het excl.-blok: eerst excl afronden
    // (100000.456 → 100000.46), daarna btw over het afgeronde bedrag —
    // ongeacht waar de btw-regel in de volgorde staat.
    const items: CostItem[] = [
      mkRegel('arbeid', 100000.456),
      mkStaart('staart_btw', 21),
      mkStaart('staart_afronding', null),
    ];
    const result = computeStaartItemBreakdowns(items);
    const af = result.find(i => i.rowType === 'staart_afronding');
    expect(af?.staartItemBreakdown?.subtotaal).toBeCloseTo(0.004, 4);
    expect(af?.staartItemBreakdown?.totaal).toBeCloseTo(100000.46, 2);
    const btw = result.find(i => i.rowType === 'staart_btw');
    expect(btw?.staartItemBreakdown?.bedrag).toBeCloseTo(100000.46, 2);
    expect(btw?.staartItemBreakdown?.totaal).toBeCloseTo(100000.46 * 1.21, 2);
  });

  it('doelbedrag = eindbedrag excl. btw incl. opslagen; btw volgt erover', () => {
    // Gebruikersspec: vul het eindbedrag excl. btw in → afronding is het
    // verschil met de berekende som; het incl-totaal = doel × (1 + btw%).
    const af = mkStaart('staart_afronding', null);
    af.staartDoelbedrag = 55000;
    const items: CostItem[] = [
      mkRegel('arbeid', 54878.67),
      mkStaart('staart_btw', 21),
      af,
    ];
    const result = computeStaartItemBreakdowns(items);
    const r = result.find(i => i.rowType === 'staart_afronding');
    expect(r?.staartItemBreakdown?.subtotaal).toBeCloseTo(121.33, 2);
    expect(r?.staartItemBreakdown?.totaal).toBeCloseTo(55000, 2);
    const btw = result.find(i => i.rowType === 'staart_btw');
    expect(btw?.staartItemBreakdown?.subtotaal).toBeCloseTo(11550, 2);
    expect(btw?.staartItemBreakdown?.totaal).toBeCloseTo(66550, 2);
  });

  it('handmatig ingevulde afronding (staartVastBedrag) is een vaste sluitpost', () => {
    const af = mkStaart('staart_afronding', null);
    af.staartVastBedrag = 250;
    const items: CostItem[] = [mkRegel('arbeid', 100000), af];
    const result = computeStaartItemBreakdowns(items);
    const r = result.find(i => i.rowType === 'staart_afronding');
    expect(r?.staartItemBreakdown?.subtotaal).toBe(250);
    expect(r?.total).toBe(250);
    expect(r?.staartItemBreakdown?.totaal).toBeCloseTo(100250, 2);
  });

  it('staartVastBedrag heeft voorrang op staartDoelbedrag; negatief mag', () => {
    const af = mkStaart('staart_afronding', null);
    af.staartVastBedrag = -125.5;
    af.staartDoelbedrag = 999999; // wordt genegeerd
    const items: CostItem[] = [mkRegel('arbeid', 100000), af];
    const result = computeStaartItemBreakdowns(items);
    const r = result.find(i => i.rowType === 'staart_afronding');
    expect(r?.staartItemBreakdown?.subtotaal).toBe(-125.5);
    expect(r?.staartItemBreakdown?.totaal).toBeCloseTo(99874.5, 2);
  });

  it('recalc met tarieven wist een direct uurloon niet (regel zonder norm)', () => {
    // Pre-existing bug: laborPrice = norm × tarief overschreef een direct
    // ingevuld uurloon met 0 zodra norm ontbrak — elke bewerking elders
    // in de begroting nulde zo alle arbeidsregels zonder productienorm.
    const r = mkRegel('arbeid', 0);
    r.quantity = 14; r.laborPrice = 60; r.tariefGroep = 'B';
    r.normQuantity = null; r.unitPrice = 0; r.total = 0;
    const result = recalculateItems([r], { A: 64, B: 43, C: 82 });
    const rr = result.find(i => i.id === r.id)!;
    expect(rr.laborPrice).toBe(60);
    expect(rr.total).toBeCloseTo(840, 2); // 14 uur × 60
  });

  it('regel mét productienorm volgt wél het tarief', () => {
    const r = mkRegel('arbeid', 0);
    r.quantity = 10; r.tariefGroep = 'B'; r.normQuantity = 2; r.laborPrice = 999;
    const result = recalculateItems([r], { A: 64, B: 43, C: 82 });
    const rr = result.find(i => i.id === r.id)!;
    expect(rr.laborPrice).toBe(86); // 2 × 43
  });

  it('staartVastBedrag = null valt terug op doelbedrag of automatisch', () => {
    const af = mkStaart('staart_afronding', null);
    af.staartVastBedrag = null;
    af.staartDoelbedrag = 105000;
    const items: CostItem[] = [mkRegel('arbeid', 100000), af];
    const result = computeStaartItemBreakdowns(items);
    const r = result.find(i => i.rowType === 'staart_afronding');
    expect(r?.staartItemBreakdown?.subtotaal).toBeCloseTo(5000, 2);
    expect(r?.staartItemBreakdown?.totaal).toBeCloseTo(105000, 2);
  });
});
