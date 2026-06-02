import { describe, it, expect } from 'vitest';
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
