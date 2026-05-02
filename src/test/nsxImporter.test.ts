import { describe, it, expect } from 'vitest';
import { importNsx } from '@/services/importers/nsxImporter';

const NSX = `<?xml version="1.0" encoding="UTF-8"?>
<Normenbestand versie="1.0">
  <Norm code="N001" middelcode="A001" omschrijving="Metselen per m2">
    <Factor>0,8</Factor>
    <Deler>1</Deler>
    <Eenheid>uur/m2</Eenheid>
  </Norm>
  <Norm code="N002" middelcode="M001" omschrijving="Beton per m3">
    <Factor>1</Factor>
    <Deler>1</Deler>
    <Eenheid>m3/m3</Eenheid>
  </Norm>
</Normenbestand>`;

describe('NSX importer', () => {
  it('imports norms', () => {
    const result = importNsx(NSX);
    expect(result.norms).toHaveLength(2);
    const n = result.norms[0];
    expect(n.code).toBe('N001');
    expect(n.middelCode).toBe('A001');
    expect(n.description).toBe('Metselen per m2');
    expect(n.factor).toBeCloseTo(0.8);
    expect(n.divisor).toBe(1);
    expect(n.unit).toBe('uur/m2');
  });
});
