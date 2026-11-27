import { describe, it, expect } from 'vitest';
import { importS01 } from '@/services/importers/s01Importer';

// Knownbug 92: twee posten met dezelfde 6-cijferige code (andere .NNN-variant)
// werden samengevoegd. Knownbug 93: titels met Ë, É e.d. werden niet herkend.
const SAMPLE = `#  Project: Test
@ST_BEGIN:
210105 .101
210105 .S01.101.A230006.035.a01.101 METSELWERK BUITENSPOUWBLAD
210105 .S01.101.A230006.035.a01.101-I01-S01
    Baksteen waalformaat.
210105 .101-END
210105 .102
210105 .S01.102.A230006.035.a01.102 METSELWERK BINNENSPOUWBLAD
210105 .S01.102.A230006.035.a01.102-I01-S01
    Kalkzandsteen.
210105 .102-END
000110 .103
000110 .S90.103.V999999.000.a01.000 BEËINDIGEN WERKZAAMHEDEN
000110 .103-END
@ST_END`;

describe('S01-import (knownbugs 92, 93)', () => {
  const res = importS01(SAMPLE);
  const posts = res.items.filter((i) => i.rowType === 'begrotingspost');

  it('houdt twee posten met dezelfde code apart (knownbug 92)', () => {
    const met = posts.filter((p) => p.code === '21.01.05');
    expect(met).toHaveLength(2);
    expect(met[0].description).toBe('METSELWERK BUITENSPOUWBLAD');
    expect(met[0].notes).toBe('Baksteen waalformaat.');
    expect(met[1].description).toBe('METSELWERK BINNENSPOUWBLAD');
    expect(met[1].notes).toBe('Kalkzandsteen.');
  });

  it('herkent titels met letters buiten A-Z (knownbug 93)', () => {
    expect(posts.find((p) => p.code === '00.01.10')?.description).toBe('BEËINDIGEN WERKZAAMHEDEN');
  });
});
