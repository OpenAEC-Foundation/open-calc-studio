import { describe, it, expect } from 'vitest';
import { importZsx } from '@/services/importers/zsxImporter';

const ZSX = `<?xml version="1.0" encoding="UTF-8"?>
<Prijslijst versie="1.0">
  <Middel code="A001" type="arbeid" naam="Uurloon timmerman">
    <Prijs>45,00</Prijs>
    <Eenheid>uur</Eenheid>
  </Middel>
  <Middel code="M001" type="materiaal" naam="Beton C20/25">
    <Prijs>80,00</Prijs>
    <Eenheid>m3</Eenheid>
  </Middel>
</Prijslijst>`;

describe('ZSX importer', () => {
  it('imports price list as ResourceLibraryItem[]', () => {
    const result = importZsx(ZSX);
    expect(result.resources).toHaveLength(2);

    const arbeid = result.resources.find((r) => r.code === 'A001');
    expect(arbeid).toBeDefined();
    expect(arbeid?.resourceType).toBe('arbeid');
    expect(arbeid?.description).toBe('Uurloon timmerman');
    expect(arbeid?.defaultUnitPrice).toBeCloseTo(45);
    expect(arbeid?.unit).toBe('uur');

    const materiaal = result.resources.find((r) => r.code === 'M001');
    expect(materiaal).toBeDefined();
    expect(materiaal?.description).toBe('Beton C20/25');
    expect(materiaal?.resourceType).toBe('materiaal');
    expect(materiaal?.defaultUnitPrice).toBeCloseTo(80);
    expect(materiaal?.unit).toBe('m³');
  });

  it('produces no warnings for a valid file', () => {
    const result = importZsx(ZSX);
    expect(result.warnings).toHaveLength(0);
  });

  it('warns when no Middel elements are present', () => {
    const result = importZsx('<?xml version="1.0"?><Prijslijst/>');
    expect(result.resources).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
