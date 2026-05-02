import { describe, it, expect } from 'vitest';
import { exportRsx } from '@/services/exporters/rsxExporter';
import { importRsx } from '@/services/importers/rsxImporter';

describe('RSX exporter', () => {
  it('round-trips CROW RAW RSX', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<RAWBestand xmlns="http://www.crow.nl/schema/raw/rsx">
  <Bestek><Naam>Dijkverhoging</Naam></Bestek>
  <Deelraming code="01" omschrijving="Voorbereiding">
    <Resultaatsverplichting besteksnummer="01.01.01">
      <Omschrijving>Opruim</Omschrijving>
      <Hoeveelheid>1</Hoeveelheid>
      <Eenheid>st</Eenheid>
      <Prijs>500</Prijs>
    </Resultaatsverplichting>
  </Deelraming>
</RAWBestand>`;
    const r1 = importRsx(xml);
    const exported = exportRsx({ schedule: { name: r1.schedule.name ?? 'X' } as any, items: r1.items });
    expect(exported.xml).toContain('<RAWBestand');
    expect(exported.xml).toContain('http://www.crow.nl/schema/raw/rsx');
    expect(exported.xml).toContain('<Naam>Dijkverhoging</Naam>');
    expect(exported.xml).toContain('besteksnummer="01.01.01"');
    const r2 = importRsx(exported.xml);
    expect(r2.items.length).toBe(r1.items.length);
    expect(r2.schedule.name).toBe(r1.schedule.name);
  });
});
