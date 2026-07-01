import { describe, it, expect } from 'vitest';
import { importS01 } from '@/services/importers/s01Importer';

const SAMPLE = `#9999.s01  STABU UITWISSELFORMAAT
#BESTEK
#  Project: Testbestek
#  Auteur: Tester
@ST_BEGIN:
B00.10.105
B00.10.105-I01-S01
    Standaardbepaling tekst.
B00.10.105-END
000110 .102
000110 .S90.102.V999999.000.a01.000 AANVULLENDE VOORWAARDEN
000110 .S90.102.V999999.000.a01.000-I01-S01
    De voorwaarden zijn aanvullingen.
000110 .102-END
210105 .101
210105 .S01.101.A230006.035.a01.101 METSELWERK BUITENSPOUWBLAD
210105 .S01.101.A230006.035.a01.101-I01-S01
    Baksteen waalformaat.
210105 .101-END
@ST_END`;

describe('S01 importer (STABU-bestek)', () => {
  it('parses the bestek into a priceable skeleton', () => {
    const res = importS01(SAMPLE);
    expect(res.format).toBe('s01');
    expect(res.schedule.name).toBe('Testbestek');
    expect(res.schedule.author).toBe('Tester');

    const chapters = res.items.filter((i) => i.rowType === 'chapter');
    const posts = res.items.filter((i) => i.rowType === 'begrotingspost');
    expect(chapters.map((c) => c.code).sort()).toEqual(['00', '21']);
    expect(posts).toHaveLength(3); // B00.10.105, 00.01.10, 21.01.05

    const met = posts.find((p) => p.description.includes('METSELWERK'));
    expect(met).toBeDefined();
    expect(met!.code).toBe('21.01.05');
    expect(met!.notes).toContain('Baksteen');

    const voorw = posts.find((p) => p.code === '00.01.10');
    expect(voorw!.description).toBe('AANVULLENDE VOORWAARDEN');

    // Bestek zonder prijzen → prijsloos skelet.
    expect(posts.every((p) => p.total === 0)).toBe(true);
    expect(res.warnings.some((w) => w.toLowerCase().includes('prijsloze'))).toBe(true);
  });
});
