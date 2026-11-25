import { describe, it, expect } from 'vitest';
import { classifyWpCalcStaartLabel } from '@/services/importers/wpcalcImporter';

// Knownbug 280: "B.T.W." en "Omzetbelasting" werden geen btw-regel, en
// "Risicoverzekering" werd risico in plaats van verzekering.
describe('WpCalc-staartlabels (knownbug 280)', () => {
  it.each([
    ['B.T.W.:', 'btw'],
    ['B.T.W. hoog', 'btw'],
    ['B.T.W. laag:', 'btw_laag'],
    ['Omzetbelasting 21%', 'btw'],
    ['Omzetbelasting laag', 'btw_laag'],
    ['VAT', 'btw'],
    ['Risicoverzekering:', 'verzekering'],
    ['CAR-verzekering', 'verzekering'],
  ] as const)('%s → %s', (label, kind) => {
    expect(classifyWpCalcStaartLabel(label)).toBe(kind);
  });

  it('laat de bestaande labels en totaalregels ongemoeid', () => {
    expect(classifyWpCalcStaartLabel('Risico:')).toBe('risico');
    expect(classifyWpCalcStaartLabel('Winst & risico:')).toBe('wr');
    expect(classifyWpCalcStaartLabel('Verzekering:')).toBe('verzekering');
    expect(classifyWpCalcStaartLabel('Btw hoog:')).toBe('btw');
    expect(classifyWpCalcStaartLabel('Totaal excl. btw.:')).toBeNull();
    expect(classifyWpCalcStaartLabel('Totaalprijs incl. B.T.W.:')).toBeNull();
    expect(classifyWpCalcStaartLabel('Evacuatieplan')).toBeNull();
  });
});
