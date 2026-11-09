import { describe, expect, it } from 'vitest';
import '@/services/wizard/hsbWandCalculator';
import { getAllWizards } from '@/services/wizard/wizardRegistry';
import { computeKostprijsBreakdown, recalculateItems } from '@/services/calculation/calculator';

// knownbugs 191: labour rows used to carry the labour price in both
// laborPrice and normUnitPrice, so the calculator counted it twice.
describe('HSB-wand wizard labour', () => {
  const wizard = getAllWizards().find(w => w.id === 'hsb-wand')!;
  const defaults = Object.fromEntries(wizard.params.map(p => [p.key, p.defaultValue]));
  const items = recalculateItems(wizard.calculate(defaults).items);

  it('counts labour for the default studs once (€468)', () => {
    // 5 m wall, 0.6 m spacing → 10 studs × 2.6 m = 26 m¹ × €18 = €468
    const arbeid = items.find(i => i.rowType === 'regel' && i.description.startsWith('Arbeid stijlen'))!;
    expect(arbeid.total).toBeCloseTo(468, 2);
    const post = items.find(i => i.id === arbeid.parentId)!;
    expect(post.total).toBeCloseTo(26 * 4.5 + 468, 2);
  });

  it('puts every labour row in the loon column exactly once', () => {
    const expectedLoon = items
      .filter(i => i.rowType === 'regel' && i.resourceType === 'arbeid')
      .reduce((sum, i) => sum + (i.quantity ?? 0) * (i.laborPrice ?? 0), 0);
    expect(computeKostprijsBreakdown(items).loon).toBeCloseTo(expectedLoon, 2);
  });
});
