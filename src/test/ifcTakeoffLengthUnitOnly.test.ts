// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { aggregateTakeoff, parseTakeoff } from '../services/ifc/ifcTakeoff';

// knownbugs 149: an IFC that declares only a LENGTHUNIT (millimetre) stores
// areas in mm² and volumes in mm³. Without AREAUNIT/VOLUMEUNIT the takeoff used
// to fall back to scale 1, so a 6 m² wall came in as 6,000,000 m².
describe('IFC takeoff with only a length unit', () => {
  it('derives area and volume scale from the millimetre length unit', async () => {
    const bytes = readFileSync('test/fixtures/ifc-lite/wall-quantities-length-unit-only.ifc');
    const model = await parseTakeoff(Uint8Array.from(bytes).buffer, 'walls-mm.ifc');
    expect(aggregateTakeoff(model, [30], 'Qto_WallBaseQuantities/Length').value).toBeCloseTo(2);
    expect(aggregateTakeoff(model, [30], 'Qto_WallBaseQuantities/NetSideArea').value).toBeCloseTo(6);
    expect(aggregateTakeoff(model, [20, 30], 'Qto_WallBaseQuantities/NetSideArea').value).toBeCloseTo(18);
    expect(aggregateTakeoff(model, [20, 30], 'Qto_WallBaseQuantities/NetVolume').value).toBeCloseTo(3.6);
  });
});
