import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { exportBudgetTable } from '@/services/exchange/tabularBudget';
import { exportCuf } from '@/services/exporters/cufExporter';
import { importCuf } from '@/services/importers/cufImporter';
import { exportTradxml } from '@/services/exporters/tradxmlExporter';
import { exportRsx } from '@/services/exporters/rsxExporter';
import type { ProjectFile } from '@/types/costModel';

const chapter = { id: 'c1', parentId: null, rowType: 'chapter', code: '01', description: 'Grondwerk', sortOrder: 0, depth: 0 } as any;
const post = {
  id: 'p1', parentId: 'c1', rowType: 'begrotingspost', code: '01.01', description: 'Regel 1\nRegel 2\tna tab',
  quantity: 1.234567, unit: 'm³', unitPrice: 12.3456, sortOrder: 1, depth: 1,
} as any;

describe('knownbug 108: CSV-export houdt volledige precisie', () => {
  it('schrijft 1.23456789012345 niet afgerond naar de CSV', () => {
    const project = {
      schedule: { currency: 'EUR' },
      items: [{ id: 'a', parentId: null, rowType: 'begrotingspost', code: '1', description: 'X', unit: 'st',
        quantity: 1.23456789012345, materialPrice: 10, laborPrice: 0, notes: '' }],
    } as unknown as ProjectFile;
    const { data } = exportBudgetTable(project, 'csv');
    const csv = new TextDecoder().decode(data);
    expect(csv).toContain('1.23456789012345');
    // De tekst leest terug als hetzelfde getal.
    const rows = XLSX.utils.sheet_to_json<unknown[]>(XLSX.read(csv, { type: 'string', raw: true }).Sheets.Sheet1, { header: 1, raw: true });
    expect(Number(rows[1][6])).toBe(1.23456789012345);
  });
});

describe('knownbug 109: XML-exports houden decimalen en regeleinden', () => {
  it('CUF: hoeveelheid en prijs met meer dan 2 decimalen overleven de round trip', () => {
    const { xml } = exportCuf({ schedule: { name: 'T' } as any, items: [chapter, post] });
    expect(xml).toContain('<Hoeveelheid>1,234567</Hoeveelheid>');
    expect(xml).toContain('<Prijs>12,3456</Prijs>');
    // Gewone bedragen blijven er uitzien zoals voorheen.
    const plain = exportCuf({ schedule: { name: 'T' } as any, items: [chapter, { ...post, quantity: 100, unitPrice: 15.5 }] }).xml;
    expect(plain).toContain('<Hoeveelheid>100,00</Hoeveelheid>');
    expect(plain).toContain('<Prijs>15,50</Prijs>');
    const back = importCuf(xml).items.find((i) => i.code === '01.01')!;
    expect(back.quantity).toBe(1.234567);
  });

  it('CUF: regeleinden en tabs in een attribuut worden als tekenreferentie geschreven', () => {
    const { xml } = exportCuf({ schedule: { name: 'T' } as any, items: [chapter, post] });
    expect(xml).toContain('omschrijving="Regel 1&#10;Regel 2&#9;na tab"');
    const back = importCuf(xml).items.find((i) => i.code === '01.01')!;
    expect(back.description).toBe('Regel 1\nRegel 2\tna tab');
  });

  it('TradXML en RSX: geen afronding op 2 decimalen', () => {
    const trad = exportTradxml({ schedule: { name: 'T' } as any, items: [chapter, post] }).xml;
    expect(trad).toContain('<Hoeveelheid>1,234567</Hoeveelheid>');
    expect(trad).toContain('<Eenheidsprijs>12,3456</Eenheidsprijs>');
    const rsx = exportRsx({ schedule: { name: 'T' } as any, items: [chapter, post] }).xml;
    expect(rsx).toContain('<Hoeveelheid>1,234567</Hoeveelheid>');
    expect(rsx).toContain('<Prijs>12,3456</Prijs>');
  });
});
