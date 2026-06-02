import { describe, it, expect } from 'vitest';
import { importCuf } from '@/services/importers/cufImporter';

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
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

describe('CUF importer', () => {
  it('imports a minimal CUF file', () => {
    const result = importCuf(SAMPLE);
    expect(result.format).toBe('cuf');
    expect(result.schedule.name).toBe('Test Begroting');
    expect(result.items).toHaveLength(2);
    const chapter = result.items.find((it) => it.rowType === 'chapter');
    expect(chapter?.description).toBe('Grondwerk');
    expect(chapter?.code).toBe('01');
    const post = result.items.find((it) => it.rowType === 'begrotingspost');
    expect(post?.quantity).toBe(100);
    expect(post?.unit).toBe('m³');
    expect(post?.unitPrice).toBeCloseTo(15.5);
    expect(post?.total).toBeCloseTo(1550);
    expect(post?.parentId).toBe(chapter?.id);
  });

  it('imports Middel elements as regels with resourceType + normfactor', () => {
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
        <Normdeler>1</Normdeler>
      </Middel>
      <Middel code="M2" type="materiaal" omschrijving="Beton C20/25">
        <Hoeveelheid>10</Hoeveelheid>
        <Eenheid>m3</Eenheid>
        <Prijs>80,00</Prijs>
      </Middel>
      <Toeslag code="T1" omschrijving="5% opslag">
        <Percentage>5</Percentage>
      </Toeslag>
    </Post>
  </Hoofdstuk>
</Calculatie>`;
    const result = importCuf(xml);
    const middelen = result.items.filter((i) => i.rowType === 'regel');
    expect(middelen).toHaveLength(2);
    const arbeid = middelen.find((m) => m.description === 'Uren timmerman');
    expect(arbeid).toBeDefined();
    expect((arbeid as any).resourceType).toBe('arbeid');
    expect((arbeid as any).normFactor).toBeCloseTo(0.8);
    expect((arbeid as any).normDivisor).toBe(1);
    const materiaal = middelen.find((m) => m.description === 'Beton C20/25');
    expect((materiaal as any).resourceType).toBe('materiaal');
    expect(result.warnings.some((w) => w.toLowerCase().includes('toeslag'))).toBe(true);
  });
});
