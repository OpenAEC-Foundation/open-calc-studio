import { describe, expect, it } from 'vitest';
import { importCuf } from '@/services/importers/cufImporter';
import { importBmecat } from '@/services/importers/bmecatImporter';

describe('getText leest alleen directe kinderen (knownbug 97)', () => {
  it('een oude CUF-post zonder eigen velden neemt die niet over van zijn Middel', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Calculatie version="4.003">
  <Naam>T</Naam>
  <Hoofdstuk code="01" omschrijving="A">
    <Post code="01.01" omschrijving="P">
      <Middel code="M1" type="arbeid" omschrijving="Uren">
        <Hoeveelheid>8</Hoeveelheid>
        <Eenheid>uur</Eenheid>
        <Prijs>45,00</Prijs>
      </Middel>
    </Post>
  </Hoofdstuk>
</Calculatie>`;
    const r = importCuf(xml);
    const post = r.items.find((i) => i.rowType === 'begrotingspost')!;
    expect(post.quantity).not.toBe(8);
    expect(post.unit).toBe('st');
    expect(post.unitPrice).not.toBe(45);
    const middel = r.items.find((i) => i.rowType === 'regel')!;
    expect(middel.quantity).toBe(8);
    expect(middel.unit).toBe('uur');
  });

  it('de naam van de begroting komt niet uit een dieper element', () => {
    const xml = `<?xml version="1.0"?><Calculatie><Hoofdstuk code="01" omschrijving="A"><Naam>Diep</Naam></Hoofdstuk></Calculatie>`;
    expect(importCuf(xml).schedule.name).toBe('Geïmporteerde begroting');
  });

  it('BMEcat vindt het kenmerkensysteem nog steeds dieper in het artikel', () => {
    const xml = `<?xml version="1.0"?><BMECAT><T_NEW_CATALOG><ARTICLE><SUPPLIER_AID>A1</SUPPLIER_AID>
      <ARTICLE_DETAILS><DESCRIPTION_SHORT>Buis</DESCRIPTION_SHORT></ARTICLE_DETAILS>
      <ARTICLE_FEATURES><REFERENCE_FEATURE_SYSTEM_NAME>ETIM-8.0</REFERENCE_FEATURE_SYSTEM_NAME></ARTICLE_FEATURES>
    </ARTICLE></T_NEW_CATALOG></BMECAT>`;
    expect(importBmecat(xml).resources[0].category).toBe('ETIM-8.0');
  });
});
