import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { importTradxml } from '@/services/importers/tradxmlImporter';
import { importCuf } from '@/services/importers/cufImporter';
import { importInschrijfstaatFile } from '@/services/importers/inschrijfstaatImporter';
import { recalculateItems } from '@/services/calculation/calculator';
import type { CostItem } from '@/types/costModel';

// Regressie knownbug 96 / issue #66 punt 4: na de import draait de app
// recalculateItems (Backstage.tsx). Die bouwt de prijs van een post op uit
// normUnitPrice + materialPrice + laborPrice; stond de prijs alleen in
// unitPrice/total, dan werd een geïmporteerd bedrag € 0.

const byDesc = (items: CostItem[], desc: string) => {
  const it = items.find((i) => i.description === desc);
  if (!it) throw new Error(`item ${desc} not found`);
  return it;
};

describe('imports keep their amounts after recalculation', () => {
  it('TRADXML', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
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
    const items = recalculateItems(importTradxml(xml).items);
    expect(byDesc(items, 'Beton storten').total).toBeCloseTo(3000);
    expect(byDesc(items, 'Beton storten').unitPrice).toBeCloseTo(120);
    expect(byDesc(items, 'Fundering').total).toBeCloseTo(3000);
  });

  it('old CUF schema: post without Middel lines', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Calculatie version="4.003">
  <Naam>Test Begroting</Naam>
  <Hoofdstuk code="01" omschrijving="Grondwerk">
    <Post code="01.01" omschrijving="Ontgraven">
      <Hoeveelheid>100</Hoeveelheid>
      <Eenheid>m3</Eenheid>
      <Prijs>15,50</Prijs>
    </Post>
  </Hoofdstuk>
</Calculatie>`;
    const items = recalculateItems(importCuf(xml).items);
    expect(byDesc(items, 'Ontgraven').total).toBeCloseTo(1550);
    expect(byDesc(items, 'Grondwerk').total).toBeCloseTo(1550);
  });

  it('old CUF schema: Middel lines keep quantity x price', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Calculatie version="4.003">
  <Naam>T</Naam>
  <Hoofdstuk code="01" omschrijving="A">
    <Post code="01.01" omschrijving="P">
      <Hoeveelheid>10</Hoeveelheid>
      <Eenheid>m3</Eenheid>
      <Prijs>100,00</Prijs>
      <Middel code="M1" type="arbeid" omschrijving="Uren timmerman">
        <Hoeveelheid>8</Hoeveelheid>
        <Eenheid>uur</Eenheid>
        <Prijs>45,00</Prijs>
        <Normfactor>0,8</Normfactor>
      </Middel>
      <Middel code="M2" type="materiaal" omschrijving="Beton C20/25">
        <Hoeveelheid>10</Hoeveelheid>
        <Eenheid>m3</Eenheid>
        <Prijs>80,00</Prijs>
      </Middel>
    </Post>
  </Hoofdstuk>
</Calculatie>`;
    const imported = importCuf(xml).items;
    const items = recalculateItems(imported);
    for (const desc of ['Uren timmerman', 'Beton C20/25']) {
      expect(byDesc(items, desc).total).toBeCloseTo(byDesc(imported, desc).total);
    }
    expect(byDesc(items, 'Uren timmerman').total).toBeCloseTo(360);
    expect(byDesc(items, 'Beton C20/25').total).toBeCloseTo(800);
    expect(byDesc(items, 'P').total).toBeCloseTo(1160);
  });

  it('Inschrijfstaat', async () => {
    const rows: (string | number)[][] = Array.from({ length: 13 }, () => ['']);
    rows.push(['vr', '', '10', 'G R O N D W E R K', '', '', '', '', '']);
    rows.push(['vr', '', '100010', 'Ontgraven', 100, 'm3', 'V', 15.5, 1550]);
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inschrijfstaat');
    const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

    const { items: imported } = await importInschrijfstaatFile(out);
    const items = recalculateItems(imported);
    expect(byDesc(items, 'Ontgraven').total).toBeCloseTo(1550);
    expect(byDesc(items, 'Ontgraven').unitPrice).toBeCloseTo(15.5);
    expect(byDesc(items, 'Grondwerk').total).toBeCloseTo(1550);
  });

  it('Inschrijfstaat: rows with only an amount keep it (no quantity, or no unit price)', async () => {
    const rows: (string | number)[][] = Array.from({ length: 13 }, () => ['']);
    rows.push(['vr', '', '10', 'G R O N D W E R K', '', '', '', '', '']);
    rows.push(['vr', '', '100010', 'Stelpost sloop', '', 'post', 'V', '', 2500]);
    rows.push(['vr', '', '100020', 'Afvoeren', 4, 'st', 'V', '', 300]);
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inschrijfstaat');
    const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

    const { items: imported } = await importInschrijfstaatFile(out);
    const items = recalculateItems(imported);
    expect(byDesc(items, 'Stelpost sloop').quantity).toBe(1);
    expect(byDesc(items, 'Stelpost sloop').total).toBeCloseTo(2500);
    expect(byDesc(items, 'Afvoeren').quantity).toBe(4);
    expect(byDesc(items, 'Afvoeren').unitPrice).toBeCloseTo(75);
    expect(byDesc(items, 'Afvoeren').total).toBeCloseTo(300);
    expect(byDesc(items, 'Grondwerk').total).toBeCloseTo(2800);
  });
});
