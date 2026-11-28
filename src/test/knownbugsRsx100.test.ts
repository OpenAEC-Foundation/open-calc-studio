import { describe, expect, it } from 'vitest';
import { importRsx } from '@/services/importers/rsxImporter';

const tussenhoofd = (nr: string, tekst: string): string =>
  `<dl22.bpost.tussenhoofd><dl22.bpost.tussenhoofdnr>${nr}</dl22.bpost.tussenhoofdnr><romptekst>${tekst}</romptekst></dl22.bpost.tussenhoofd>`;

/** Synthetisch RAW-bestek (dl22.*); geen echt voorbeeldbestand beschikbaar. */
const raw = (...nrs: [string, string][]): string => `<?xml version="1.0"?>
<raw><raw.contractinfo><raw.bestek.nr>B1</raw.bestek.nr></raw.contractinfo>
<dl22.vsub.compleet>${nrs.map(([nr, t]) => tussenhoofd(nr, t)).join('')}</dl22.vsub.compleet></raw>`;

describe('RAW RSX: hoofdstukdiepte vanaf hoofdstuk 10 (knownbug 100)', () => {
  it('hangt een tussenhoofd van vier cijfers onder zijn hoofdstuk van twee cijfers', () => {
    const r = importRsx(raw(['01', 'Algemeen'], ['0101', 'Sub 1'], ['10', 'Hoofdstuk tien'], ['1001', 'Sub 10'], ['22', 'Grondwerk'], ['2201', 'Ontgraven']));
    const byCode = Object.fromEntries(r.items.map((i) => [i.code, i]));
    expect(r.items.map((i) => [i.code, i.depth])).toEqual([
      ['01', 0], ['0101', 1], ['10', 0], ['1001', 1], ['22', 0], ['2201', 1],
    ]);
    expect(byCode['1001'].parentId).toBe(byCode['10'].id);
    expect(byCode['2201'].parentId).toBe(byCode['22'].id);
    expect(byCode['10'].parentId).toBeNull();
  });
});
