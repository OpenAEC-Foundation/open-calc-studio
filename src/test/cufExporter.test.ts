import { describe, it, expect } from 'vitest';
import { exportCuf } from '@/services/exporters/cufExporter';
import { importCuf } from '@/services/importers/cufImporter';

describe('CUF exporter', () => {
  it('exports basic structure', () => {
    const input = {
      schedule: { name: 'Test Begroting' } as any,
      items: [
        { id: '1', rowType: 'chapter', code: '01', description: 'Grondwerk', sortOrder: 0, depth: 0 } as any,
        { id: '2', parentId: '1', rowType: 'begrotingspost', code: '01.01', description: 'Ontgraven',
          quantity: 100, unit: 'm³', unitPrice: 15.5, sortOrder: 1, depth: 1 } as any,
      ],
    };
    const result = exportCuf(input);
    expect(result.format).toBe('cuf');
    expect(result.xml).toContain('<Calculatie version="4.003">');
    expect(result.xml).toContain('<Naam>Test Begroting</Naam>');
    expect(result.xml).toContain('code="01"');
    expect(result.xml).toContain('omschrijving="Grondwerk"');
    expect(result.xml).toContain('<Hoeveelheid>100,00</Hoeveelheid>');
    expect(result.xml).toContain('<Eenheid>m3</Eenheid>');
    expect(result.xml).toContain('<Prijs>15,50</Prijs>');
  });

  it('round-trips: import → export → import yields same data', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Calculatie version="4.003">
  <Naam>RT Test</Naam>
  <Hoofdstuk code="01" omschrijving="A">
    <Post code="01.01" omschrijving="P">
      <Hoeveelheid>5</Hoeveelheid>
      <Eenheid>m3</Eenheid>
      <Prijs>10,00</Prijs>
    </Post>
  </Hoofdstuk>
</Calculatie>`;
    const r1 = importCuf(xml);
    const exported = exportCuf({ schedule: { name: r1.schedule.name ?? 'X' } as any, items: r1.items });
    const r2 = importCuf(exported.xml);
    expect(r2.items.length).toBe(r1.items.length);
    expect(r2.items[0].description).toBe(r1.items[0].description);
    expect(r2.items[1].quantity).toBe(r1.items[1].quantity);
    expect(r2.items[1].unitPrice).toBeCloseTo(r1.items[1].unitPrice);
  });
});
