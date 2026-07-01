import { describe, it, expect } from 'vitest';
import { importCuf } from '@/services/importers/cufImporter';
import { recalculateItems } from '@/services/calculation/calculator';

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

// Standaard CUF 4.003: <CUF> met geneste <BUNDELING> en <BEGROTINGSREGEL>,
// alle gegevens in hoofdletter-attributen (zoals externe pakketten uitwisselen).
describe('CUF importer — standaard 4.003 schema', () => {
  const STANDARD = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<CUF xmlns="x-schema:CufSchema.xml" xmlns:Ibis="http://example.invalid/ibis">
  <PROJECTGEGEVENS CUF_VERSIE="4.003" PROJECTNUMMER="P-1" PROJECTNAAM="Mini CUF" CALCULATOR="cal" OPDRACHTGEVER="og"></PROJECTGEGEVENS>
  <BEGROTING UREN="40.00" LOONKOSTEN="2052.00" MATERIAALKOSTEN="880.00" ONDERAANNEMING="550.00">
    <BUNDELING CODE="05." OMSCHRIJVING="BOUWPLAATSVOORZIENINGEN" EENHEID="TOT" TERUGDEEL_HOEVEELHEID="1.00" Ibis:AANDUIDING="1">
      <BUNDELING CODE="05.31." OMSCHRIJVING="LOODSEN EN KETEN" EENHEID="PST" TERUGDEEL_HOEVEELHEID="1.00" Ibis:AANDUIDING="2">
        <BEGROTINGSREGEL CODE="05.31.05." OMSCHRIJVING="plaatsen schaftkeet" HOEVEELHEID_EENHEID="st" HOEVEELHEID="1.00" INZET="1.00000" HOEVEELHEID_FACTOR="1.00000" UUR_NORM="40.00" MATERIAALPRIJS="" MATERIEELPRIJS="" ONDERAANNEMINGSPRIJS="" UUR_TARIEF="513" BTW="21"></BEGROTINGSREGEL>
        <BEGROTINGSREGEL CODE="05.31.05." OMSCHRIJVING="schaftkeet huur" HOEVEELHEID_EENHEID="wk" HOEVEELHEID="16.00" INZET="1.00000" HOEVEELHEID_FACTOR="1.00000" UUR_NORM="" MATERIAALPRIJS="55.00" MATERIEELPRIJS="" ONDERAANNEMINGSPRIJS="" UUR_TARIEF="513" BTW="21"></BEGROTINGSREGEL>
        <BEGROTINGSREGEL CODE="05.31.05." OMSCHRIJVING="aanvoer keet" HOEVEELHEID_EENHEID="st" HOEVEELHEID="1.00" INZET="1.00000" HOEVEELHEID_FACTOR="1.00000" UUR_NORM="" MATERIAALPRIJS="" MATERIEELPRIJS="" ONDERAANNEMINGSPRIJS="550.00" UUR_TARIEF="513" BTW="21"></BEGROTINGSREGEL>
      </BUNDELING>
    </BUNDELING>
  </BEGROTING>
</CUF>`;

  it('imports nested BUNDELING/BEGROTINGSREGEL into chapter → post → regels', () => {
    const result = importCuf(STANDARD);
    expect(result.format).toBe('cuf');
    expect(result.schedule.name).toBe('Mini CUF');

    const chapters = result.items.filter((i) => i.rowType === 'chapter');
    const posts = result.items.filter((i) => i.rowType === 'begrotingspost');
    const regels = result.items.filter((i) => i.rowType === 'regel');
    expect(chapters).toHaveLength(1);          // 05. (heeft sub-bundeling → hoofdstuk)
    expect(posts).toHaveLength(1);             // 05.31. (heeft regels → post)
    expect(regels).toHaveLength(3);            // arbeid + materiaal + onderaanneming
    expect(posts[0].parentId).toBe(chapters[0].id);
    expect(regels.every((r) => r.parentId === posts[0].id)).toBe(true);

    const arbeid = regels.find((r) => r.resourceType === 'arbeid');
    const materiaal = regels.find((r) => r.resourceType === 'materiaal');
    const oa = regels.find((r) => r.resourceType === 'onderaannemer');
    expect(arbeid).toBeDefined();
    expect(materiaal).toBeDefined();
    expect(oa).toBeDefined();
    // Uurtarief "513" → € 51,30 (geen tarieventabel in CUF), met waarschuwing.
    expect(result.schedule.tarieven?.A).toBeCloseTo(51.3);
    expect(result.warnings.some((w) => w.toLowerCase().includes('uurtarief'))).toBe(true);
  });

  it('computes line totals via the standard regel formula', () => {
    const items = recalculateItems(importCuf(STANDARD).items);
    const total = (desc: string) => items.find((i) => i.description === desc)?.total ?? 0;
    expect(total('plaatsen schaftkeet')).toBeCloseTo(2052, 0); // 1 × 40 uur × € 51,30
    expect(total('schaftkeet huur')).toBeCloseTo(880, 0);      // 16 × € 55,00
    expect(total('aanvoer keet')).toBeCloseTo(550, 0);         // 1 × € 550,00
  });
});
