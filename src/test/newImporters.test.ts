import { describe, it, expect } from 'vitest';
import {
  parseCsv,
  autoDetectMapping,
  buildFromMapping,
  importBmecat,
  importSufx,
  importRsu,
} from '@/services/importers';

describe('Generieke Excel/CSV-import', () => {
  const csv = [
    'Code;Omschrijving;Eenheid;Hoeveelheid;Eenheidsprijs',
    '01;Grondwerk;;;', // hoofdstuk (geen hoeveelheid/prijs)
    '01.01;Ontgraven;m3;100;12,50', // post met NL-decimaal
    '01.02;Aanvullen;m3;50;8,00',
  ].join('\n');

  it('parseCsv detecteert scheidingsteken, koppen en rijen', () => {
    const data = parseCsv(csv, 'test');
    expect(data.headers).toEqual(['Code', 'Omschrijving', 'Eenheid', 'Hoeveelheid', 'Eenheidsprijs']);
    expect(data.rows.length).toBe(3);
  });

  it('autoDetectMapping herkent standaardkoppen', () => {
    const m = autoDetectMapping(['Code', 'Omschrijving', 'Eenheid', 'Hoeveelheid', 'Eenheidsprijs']);
    expect(m).toEqual(['code', 'description', 'unit', 'quantity', 'unitPrice']);
  });

  it('buildFromMapping bouwt hoofdstuk + geneste posten met juiste bedragen', () => {
    const data = parseCsv(csv, 'test');
    const result = buildFromMapping(data, autoDetectMapping(data.headers));
    expect(result.items.length).toBe(3);

    const chapter = result.items.find((i) => i.rowType === 'chapter');
    expect(chapter?.description).toBe('Grondwerk');

    const post = result.items.find((i) => i.code === '01.01');
    expect(post?.rowType).toBe('begrotingspost');
    expect(post?.quantity).toBe(100);
    expect(post?.unitPrice).toBe(12.5); // "12,50" NL-decimaal
    expect(post?.total).toBe(1250);
    expect(post?.parentId).toBe(chapter?.id);
  });

  it('leidt eenheidsprijs af uit materiaal + arbeid', () => {
    const data = parseCsv(
      ['Omschrijving,Hoeveelheid,Materiaal,Arbeid', 'Metselwerk,10,20,30'].join('\n'),
      'x',
    );
    const result = buildFromMapping(data, autoDetectMapping(data.headers));
    const post = result.items[0];
    expect(post.materialPrice).toBe(20);
    expect(post.laborPrice).toBe(30);
    expect(post.unitPrice).toBe(50);
    expect(post.total).toBe(500);
  });
});

describe('BMEcat/DICO prijsdata-import', () => {
  const xml = `<?xml version="1.0"?><BMECAT><T_NEW_CATALOG>
    <ARTICLE><SUPPLIER_AID>ART-1</SUPPLIER_AID>
      <ARTICLE_DETAILS><DESCRIPTION_SHORT>Buis PVC 110mm</DESCRIPTION_SHORT></ARTICLE_DETAILS>
      <ARTICLE_ORDER_DETAILS><ORDER_UNIT>m</ORDER_UNIT></ARTICLE_ORDER_DETAILS>
      <ARTICLE_PRICE_DETAILS><ARTICLE_PRICE><PRICE_AMOUNT>4.75</PRICE_AMOUNT></ARTICLE_PRICE></ARTICLE_PRICE_DETAILS>
    </ARTICLE>
    <ARTICLE><SUPPLIER_AID>ART-2</SUPPLIER_AID>
      <ARTICLE_DETAILS><DESCRIPTION_SHORT>Bocht 45 graden</DESCRIPTION_SHORT></ARTICLE_DETAILS>
      <ARTICLE_ORDER_DETAILS><ORDER_UNIT>stuk</ORDER_UNIT></ARTICLE_ORDER_DETAILS>
      <ARTICLE_PRICE_DETAILS><ARTICLE_PRICE><PRICE_AMOUNT>2.10</PRICE_AMOUNT></ARTICLE_PRICE></ARTICLE_PRICE_DETAILS>
    </ARTICLE>
  </T_NEW_CATALOG></BMECAT>`;

  it('leest artikelen als middelen met code, prijs en eenheid', () => {
    const r = importBmecat(xml);
    expect(r.resources.length).toBe(2);
    const a = r.resources.find((x) => x.code === 'ART-1');
    expect(a?.description).toBe('Buis PVC 110mm');
    expect(a?.unit).toBe('m');
    expect(a?.defaultUnitPrice).toBe(4.75);
    expect(a?.resourceType).toBe('materiaal');
    const b = r.resources.find((x) => x.code === 'ART-2');
    expect(b?.unit).toBe('st'); // "stuk" → st
  });
});

describe('SUFX (STABU Bouwbreed XML)', () => {
  const xml = `<?xml version="1.0"?><SUFX>
    <hoofdstuk code="21"><titel>Betonwerk</titel></hoofdstuk>
    <post code="210110"><titel>Funderingsbalken</titel><tekst>Beton C25/30</tekst></post>
    <post code="210120"><titel>Wapening</titel></post>
  </SUFX>`;

  it('bouwt hoofdstuk + besteksposten als prijsloos skelet', () => {
    const r = importSufx(xml);
    const chapter = r.items.find((i) => i.rowType === 'chapter');
    expect(chapter?.description).toBe('Betonwerk');
    const posts = r.items.filter((i) => i.rowType === 'begrotingspost');
    expect(posts.length).toBe(2);
    expect(posts[0].code).toBe('21.01.10');
    expect(posts[0].parentId).toBe(chapter?.id);
    expect(posts[0].notes).toContain('Beton');
  });
});

describe('Legacy RAW RSU', () => {
  it('delegeert XML-inhoud naar de RSX-route', () => {
    const rsx = `<?xml version="1.0"?><RAWBestand><Bestek><Naam>Testbestek</Naam></Bestek>
      <Deelraming code="01" omschrijving="Grondwerk">
        <Resultaatsverplichting besteksnummer="010100"><Omschrijving>Ontgraven</Omschrijving><Hoeveelheid>100</Hoeveelheid><Eenheid>m3</Eenheid><Prijs>10</Prijs></Resultaatsverplichting>
      </Deelraming></RAWBestand>`;
    const r = importRsu(rsx);
    expect(r.format).toBe('rsu');
    expect(r.items.length).toBeGreaterThan(0);
  });

  it('geeft een duidelijke melding bij het oude niet-XML formaat', () => {
    const r = importRsu('RSU 2.0\n001 010100 Ontgraven 100 m3');
    expect(r.items.length).toBe(0);
    expect(r.warnings.join(' ')).toMatch(/niet-XML RSU/i);
  });
});
