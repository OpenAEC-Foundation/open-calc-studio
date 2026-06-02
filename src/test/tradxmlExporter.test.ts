import { describe, it, expect } from 'vitest';
import { exportTradxml } from '@/services/exporters/tradxmlExporter';
import { importTradxml } from '@/services/importers/tradxmlImporter';

describe('TRADXML exporter', () => {
  it('round-trips IBIS-TRAD structure', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Begroting version="7.10">
  <Kop><Projectnaam>IBIS RT</Projectnaam></Kop>
  <Hoofdstuk code="H1" omschrijving="F">
    <Element code="E1" omschrijving="SF">
      <Activiteit code="A1" omschrijving="BS">
        <Hoeveelheid>25</Hoeveelheid>
        <Eenheid>m3</Eenheid>
        <Eenheidsprijs>120.00</Eenheidsprijs>
      </Activiteit>
    </Element>
  </Hoofdstuk>
</Begroting>`;
    const r1 = importTradxml(xml);
    const exported = exportTradxml({ schedule: { name: r1.schedule.name ?? 'X' } as any, items: r1.items });
    expect(exported.xml).toContain('<Begroting version="7.10">');
    expect(exported.xml).toContain('<Projectnaam>IBIS RT</Projectnaam>');
    expect(exported.xml).toContain('<Activiteit code="A1"');
    const r2 = importTradxml(exported.xml);
    expect(r2.items.length).toBe(r1.items.length);
  });
});
