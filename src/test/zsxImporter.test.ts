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

describe('ZSX: omschrijving en ontbrekende prijs (knownbug 98)', () => {
  const xml = `<?xml version="1.0"?><Prijslijst>
    <Middel code="M1" type="materiaal"><Omschrijving>Zand</Omschrijving><Eenheid>m3</Eenheid></Middel>
    <Middel code="M2" type="materiaal" naam=""><Naam>Grind</Naam><Prijs>0</Prijs></Middel>
  </Prijslijst>`;

  it('leest <Omschrijving> als er geen naam is', () => {
    const r = importZsx(xml);
    expect(r.resources.find((x) => x.code === 'M1')?.description).toBe('Zand');
    expect(r.resources.find((x) => x.code === 'M2')?.description).toBe('Grind');
  });

  it('laat een ontbrekende prijs leeg in plaats van 0', () => {
    const r = importZsx(xml);
    expect(r.resources.find((x) => x.code === 'M1')?.defaultUnitPrice).toBeNull();
    expect(r.resources.find((x) => x.code === 'M2')?.defaultUnitPrice).toBe(0);
  });
});
