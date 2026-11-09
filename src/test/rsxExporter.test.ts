import { describe, it, expect } from 'vitest';
import { exportRsx } from '@/services/exporters/rsxExporter';
import { importRsx } from '@/services/importers/rsxImporter';
import { makeCostItem } from '@/services/importers/xmlHelpers';

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

  it('exports items under nested chapters (knownbug 59) and keeps them on round trip', () => {
    const h1 = makeCostItem({ parentId: null, sortOrder: 0, depth: 0, rowType: 'chapter', code: '01', description: 'Grondwerk' });
    const h11 = makeCostItem({ parentId: h1.id, sortOrder: 1, depth: 1, rowType: 'chapter', code: '01.1', description: 'Ontgraven' });
    const h111 = makeCostItem({ parentId: h11.id, sortOrder: 2, depth: 2, rowType: 'chapter', code: '01.1.A', description: 'Diep' });
    const p1 = makeCostItem({ parentId: h1.id, sortOrder: 3, depth: 1, rowType: 'begrotingspost', code: '01.01', description: 'Direct', quantity: 2, unit: 'm³', unitPrice: 10 });
    const p2 = makeCostItem({ parentId: h11.id, sortOrder: 4, depth: 2, rowType: 'begrotingspost', code: '01.1.1', description: 'Sub', quantity: 3, unit: 'm³', unitPrice: 20 });
    const p3 = makeCostItem({ parentId: h111.id, sortOrder: 5, depth: 3, rowType: 'begrotingspost', code: '01.1.A.1', description: 'Subsub', quantity: 4, unit: 'm³', unitPrice: 30 });
    const items = [h1, h11, h111, p1, p2, p3];

    const exported = exportRsx({ schedule: { name: 'Nested' } as any, items });
    for (const code of ['01.01', '01.1.1', '01.1.A.1']) {
      expect(exported.xml).toContain(`besteksnummer="${code}"`);
    }
    expect(exported.warnings.length).toBe(1);

    const back = importRsx(exported.xml);
    const posts = back.items.filter((it) => it.rowType === 'begrotingspost');
    expect(posts.map((p) => p.code).sort()).toEqual(['01.01', '01.1.1', '01.1.A.1']);
    expect(posts.reduce((sum, p) => sum + (p.total ?? 0), 0)).toBe(2 * 10 + 3 * 20 + 4 * 30);
    const chapter = back.items.find((it) => it.rowType === 'chapter');
    expect(chapter?.code).toBe('01');
    expect(posts.every((p) => p.parentId === chapter?.id)).toBe(true);
  });
});
