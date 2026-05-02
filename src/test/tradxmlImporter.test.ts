import { describe, it, expect } from 'vitest';
import { importTradxml } from '@/services/importers/tradxmlImporter';

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<Begroting version="7.10">
  <Kop><Projectnaam>IBIS Test</Projectnaam></Kop>
  <Hoofdstuk code="H1" omschrijving="Fundering">
    <Element code="E1" omschrijving="Strokenfundering">
      <Activiteit code="A1" omschrijving="Beton storten">
        <Hoeveelheid>25</Hoeveelheid>
        <Eenheid>m3</Eenheid>
        <Eenheidsprijs>120.00</Eenheidsprijs>
      </Activiteit>
    </Element>
  </Hoofdstuk>
</Begroting>`;

describe('TRADXML importer', () => {
  it('imports IBIS-TRAD XML with nested elements', () => {
    const result = importTradxml(SAMPLE);
    expect(result.format).toBe('tradxml');
    expect(result.schedule.name).toBe('IBIS Test');
    expect(result.items.filter((i) => i.rowType === 'chapter')).toHaveLength(2);
    const activity = result.items.find((i) => i.description === 'Beton storten');
    expect(activity?.quantity).toBe(25);
    expect(activity?.unit).toBe('m³');
    expect(activity?.unitPrice).toBeCloseTo(120);
    expect(activity?.total).toBeCloseTo(3000);
  });
});
