import { describe, expect, it } from 'vitest';
import '@/services/wizard/hsbWandCalculator';
import { getAllWizards } from '@/services/wizard/wizardRegistry';

// knownbugs 192: 4.2 / 0.6 is 7.000000000000001 in floating point, so
// Math.ceil gave 8 spaces (9 studs) instead of 7 spaces (8 studs).
describe('HSB-wand wizard stud count', () => {
  const wizard = getAllWizards().find(w => w.id === 'hsb-wand')!;
  const defaults = Object.fromEntries(wizard.params.map(p => [p.key, p.defaultValue]));

  const studs = (lengte: number, stijlAfstand: number) => {
    const { items } = wizard.calculate({ ...defaults, lengte, stijlAfstand });
    const post = items.find(i => i.rowType === 'begrotingspost' && i.description.startsWith('Stijlen'))!;
    return Number(/\((\d+) stuks\)/.exec(post.description)![1]);
  };

  it('does not add an extra stud through float rounding', () => {
    expect(studs(4.2, 0.6)).toBe(8);
    expect(studs(3.6, 0.6)).toBe(7);
    expect(studs(0.9, 0.3)).toBe(4);
  });

  it('still rounds up a real remainder', () => {
    expect(studs(5, 0.6)).toBe(10);
    expect(studs(4.25, 0.6)).toBe(9);
  });
});
