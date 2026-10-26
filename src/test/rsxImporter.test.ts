import { describe, it, expect } from 'vitest';
import { recalculateItems } from '@/services/calculation/calculator';
import { importRsx } from '@/services/importers/rsxImporter';

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<RAWBestand xmlns="http://www.crow.nl/schema/raw/rsx">
  <Bestek><Naam>Project Dijkverhoging</Naam></Bestek>
  <Deelraming code="01" omschrijving="Voorbereiding">
    <Resultaatsverplichting besteksnummer="01.01.01">
      <Omschrijving>Opruimwerkzaamheden</Omschrijving>
      <Hoeveelheid>1</Hoeveelheid>
      <Eenheid>st</Eenheid>
    </Resultaatsverplichting>
  </Deelraming>
</RAWBestand>`;

describe('RSX importer', () => {
  it('imports RAW RSX file', () => {
    const result = importRsx(SAMPLE);
    expect(result.format).toBe('rsx');
    expect(result.schedule.name).toBe('Project Dijkverhoging');
    const post = result.items.find((i) => i.code === '01.01.01');
    expect(post?.description).toBe('Opruimwerkzaamheden');
    expect(post?.unit).toBe('st');
    expect(post?.quantity).toBe(1);
  });
});

 it('preserves imported RSX prices across recalculation and quantity edits', () => {
   const xml = SAMPLE.replace('<Hoeveelheid>1</Hoeveelheid>', '<Hoeveelheid>1</Hoeveelheid><Prijs>150</Prijs>');
   const first = recalculateItems(importRsx(xml).items);
   const post = first.find(i => i.rowType === 'begrotingspost')!;
   expect(post.total).toBe(150);
   post.quantity = 2;
   const second = recalculateItems(first);
   expect(second.find(i => i.id === post.id)?.total).toBe(300);
   expect(second.find(i => i.rowType === 'chapter')?.total).toBe(300);
 });
