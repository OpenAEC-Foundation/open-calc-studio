import { describe, it, expect } from 'vitest';
import { importOnlv, importOnlvFile, a2063TextLines, POSART_MARKERS } from '@/services/importers/onlvImporter';
import { buildOnlv } from '@/services/export/onlvExporter';
import { recalculateItems, getKostprijs } from '@/services/calculation/calculator';
import { describeImportWarnings } from '@/components/common/ImportWarningsDialog';
import type { CostItem, CostSchedule } from '@/types/costModel';
import enDialogs from '@/i18n/locales/en/dialogs.json';
import nlDialogs from '@/i18n/locales/nl/dialogs.json';

/**
 * Synthetische ÖNORM A 2063-fragmenten per schema-onderdeel (onlv.xsd,
 * onlb.xsd, ontypdef.xsd, ontext.xsd). De echte Leistungsbücher staan in
 * onlbPraktijk.test.ts, de rondreis in onlvRoundtrip.test.ts.
 */

const NS2021 = 'http://www.oenorm.at/schema/A2063/2021-03-01';
const NS2015 = 'http://www.oenorm.at/schema/A2063/2015-07-15';

const META = '<metadaten><erstelltam>2026-01-02T03:04:05</erstelltam><dateiname>t.onlv</dateiname><programmsystem>Test</programmsystem><programmversion>1</programmversion></metadaten>';
const HEADER = `${META}<leistungsteiltabelle><leistungsteil nr="1"><bezeichnung>Alles</bezeichnung><definition><festpreise/></definition></leistungsteil></leistungsteiltabelle><zugelassenenachlaesse><aufsummen/><hierarchiestufen/></zugelassenenachlaesse>`;
const KENN = (extra = '') => `<kenndaten><lvcode>LV-7</lvcode><vorhaben>Wohnhaus Musterstraße</vorhaben><lvbezeichnung>Baumeisterarbeiten</lvbezeichnung>`
  + '<auftraggeber><firma><name>Stadt Wien</name></firma></auftraggeber><lversteller><person><nachname>Huber</nachname><vorname>Anna</vorname></person></lversteller>'
  + `<preisanteilmodell><preisanteile/></preisanteilmodell><wkz>EUR</wkz>${extra}<preisbasis>2026-01-01</preisbasis></kenndaten>`;
const LB = '<preiserstellungsverfahren>Preisangebotsverfahren</preiserstellungsverfahren><lb><bezeichnung>LB-HB</bezeichnung><herausgeber><firma><name>BM</name></firma></herausgeber><lbkennung>HB</lbkennung><versionsnummer>23</versionsnummer><versionsdatum>2025-12-31</versionsdatum><status>freigegeben</status></lb>';

const pos = (stichwort: string, opts: {
  einheit?: string; menge?: string; pa1?: string; pa2?: string; gesamt?: string; pospreis?: string;
  pzzv?: string; langtext?: string; nichtangeboten?: boolean; wesentlich?: boolean;
} = {}): string => {
  const { einheit = 'm²', menge = '10.00', pa1, pa2, gesamt = '0.00', pospreis, pzzv = '<normalposition/>', langtext = '', nichtangeboten = false, wesentlich = false } = opts;
  const preis = nichtangeboten
    ? '<nichtangeboten/>'
    : `<preis>${pa1 != null ? `<preisanteil1>${pa1}</preisanteil1><preisanteil2>${pa2}</preisanteil2>` : ''}<gesamt>${gesamt}</gesamt></preis><pospreis>${pospreis ?? (parseFloat(menge) * parseFloat(gesamt)).toFixed(2)}</pospreis>`;
  return `<pos-eigenschaften><stichwort>${stichwort}</stichwort>${langtext ? `<langtext>${langtext}</langtext>` : ''}`
    + `<einheit>${einheit}</einheit><pzzv>${pzzv}</pzzv>${wesentlich ? '<wesentlicheposition>W</wesentlicheposition>' : ''}<leistungsteil>1</leistungsteil><lvmenge>${menge}</lvmenge>${preis}</pos-eigenschaften>`;
};

const summe = (tag: string, pa1: string, pa2: string, gesamt: string): string =>
  `<${tag}><summe><preisanteil1>${pa1}</preisanteil1><preisanteil2>${pa2}</preisanteil2><gesamt>${gesamt}</gesamt></summe><summe-inkl-na><preisanteil1>${pa1}</preisanteil1><preisanteil2>${pa2}</preisanteil2><gesamt>${gesamt}</gesamt></summe-inkl-na></${tag}>`;

const lgOnlv = (positionen: string, opts: { ns?: string; lvSumme?: string; svb?: string; lvType?: string } = {}): string =>
  `<?xml version="1.0" encoding="UTF-8"?><onlv xmlns="${opts.ns ?? NS2021}">${HEADER}<${opts.lvType ?? 'kostenschaetzungs-lv'}>${KENN()}`
  + `<gliederung-lg>${LB}<svb>${opts.svb ?? ''}</svb><lg-liste><lg nr="01"><lg-eigenschaften><ueberschrift>Baustelleneinrichtung</ueberschrift>`
  + '<vorbemerkung><p>Gilt für alle Positionen.</p></vorbemerkung></lg-eigenschaften><ulg-liste><ulg nr="02"><ulg-eigenschaften><ueberschrift>Einrichten</ueberschrift></ulg-eigenschaften>'
  + `<positionen>${positionen}</positionen></ulg></ulg-liste></lg></lg-liste></gliederung-lg>${opts.lvSumme ?? ''}</${opts.lvType ?? 'kostenschaetzungs-lv'}></onlv>`;

const schedule = (partial: Partial<CostSchedule>): CostSchedule => ({
  id: 't', name: '', description: '', status: 'DRAFT', predefinedType: 'BUDGET', currency: 'EUR',
  projectName: '', projectNumber: '', client: '', author: '', ifcGuid: 't',
  uitvoeringskosten: 0, algemeneKosten: 0, winstRisico: 0, ...partial,
});

const byCode = (items: CostItem[], code: string): CostItem => {
  const it = items.find((i) => i.code === code);
  if (!it) throw new Error(`geen item met code ${code}: ${items.map((i) => i.code).join(', ')}`);
  return it;
};

describe('ÖNORM A 2063 (.onlv) import — structuur', () => {
  it('leest een LV met lg/ulg, grundtext + folgepositionen en preisanteile', () => {
    const xml = lgOnlv(
      '<grundtextnr nr="03"><grundtext><langtext><p>Baustelle einrichten,</p></langtext></grundtext>'
      + `<folgeposition ftnr="A" mfv="">${pos('bis 500 m²', { menge: '12.50', pa1: '40.00', pa2: '60.00', gesamt: '100.00', langtext: '<p>für kleine Baustellen.</p>' })}</folgeposition>`
      + `<folgeposition ftnr="B" mfv="">${pos('über 500 m²', { menge: '3.00', pa1: '50.00', pa2: '150.00', gesamt: '200.00' })}</folgeposition></grundtextnr>`,
      { lvSumme: summe('lv-summe', '650.00', '1200.00', '1850.00') },
    );
    const res = importOnlv(xml);
    expect(res.format).toBe('onlv');
    expect(res.schedule.projectName).toBe('Wohnhaus Musterstraße');
    expect(res.schedule.name).toBe('Baumeisterarbeiten');
    expect(res.schedule.projectNumber).toBe('LV-7');
    expect(res.schedule.client).toBe('Stadt Wien');
    expect(res.schedule.author).toBe('Anna Huber');
    expect(res.schedule.predefinedType).toBe('ESTIMATE');
    expect(res.items.map((i) => `${i.rowType}:${i.code}`)).toEqual([
      'chapter:01', 'chapter:02', 'begrotingspost:01.02.03A', 'begrotingspost:01.02.03B',
    ]);
    const lg = byCode(res.items, '01');
    expect(lg.description).toBe('Baustelleneinrichtung');
    expect(lg.notes).toBe('Gilt für alle Positionen.');
    expect(byCode(res.items, '02').parentId).toBe(lg.id);
    const a = byCode(res.items, '01.02.03A');
    expect(a.description).toBe('bis 500 m²');
    expect(a.unit).toBe('m²');
    expect(a.quantity).toBe(12.5);
    expect(a.laborPrice).toBe(40);
    expect(a.materialPrice).toBe(60);
    expect(a.normUnitPrice).toBeNull();
    // Grundtext vóór de folgetekst in de notities.
    expect(a.notes).toBe('Baustelle einrichten,\nfür kleine Baustellen.');
    const items = recalculateItems(res.items);
    expect(byCode(items, '01.02.03A').total).toBeCloseTo(1250, 2);
    expect(getKostprijs(items)).toBeCloseTo(1850, 2);
    // Som klopt met het bestand: geen melding.
    expect(res.warnings).toEqual([]);
  });

  it('leest hg/og/lg/ulg-niveaus als geneste hoofdstukken met volledige positienummers', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?><onlv xmlns="${NS2021}">${HEADER}<ausschreibungs-lv>${KENN()}<gliederung-hg><hg-liste>`
      + '<hg nr="01"><hg-eigenschaften><ueberschrift>Rohbau</ueberschrift></hg-eigenschaften><og-liste>'
      + `<og nr="02"><og-eigenschaften><ueberschrift>Keller</ueberschrift></og-eigenschaften>${LB}<svb><vorbemerkung><p>Ständige Vorbemerkung.</p></vorbemerkung></svb><lg-liste>`
      + '<lg nr="03"><lg-eigenschaften><ueberschrift>Beton</ueberschrift></lg-eigenschaften><ulg-liste><ulg nr="04"><ulg-eigenschaften><ueberschrift>Wände</ueberschrift></ulg-eigenschaften>'
      + `<positionen><grundtextnr nr="05"><ungeteilteposition mfv="">${pos('Kellerwand', { einheit: 'm³', nichtangeboten: true })}</ungeteilteposition></grundtextnr></positionen>`
      + '</ulg></ulg-liste></lg></lg-liste></og></og-liste></hg></hg-liste></gliederung-hg></ausschreibungs-lv></onlv>';
    const res = importOnlv(xml);
    expect(res.items.map((i) => `${i.depth}:${i.rowType}:${i.code}`)).toEqual([
      '0:chapter:01', '1:chapter:02', '2:chapter:03', '3:chapter:04', '4:begrotingspost:01.02.03.04.05',
    ]);
    expect(res.schedule.description).toBe('Ständige Vorbemerkung.');
    expect(res.schedule.predefinedType).toBe('TENDER');
    const p = byCode(res.items, '01.02.03.04.05');
    expect(p.unit).toBe('m³');
    expect(p.laborPrice).toBeNull();
    expect(p.normUnitPrice).toBeNull();
    // Ausschreibungs-LV zonder prijzen: melding.
    expect(res.warningCodes?.map((c) => c.code)).toContain('noPrices');
  });

  it('leest een LV met og/lg/ulg (gliederung-og) en een LV zonder Gliederung (posfrei)', () => {
    const og = `<?xml version="1.0" encoding="UTF-8"?><onlv xmlns="${NS2021}">${HEADER}<entwurfs-lv>${KENN().replace('<preisbasis>2026-01-01</preisbasis>', '')}<gliederung-og><og-liste>`
      + `<og nr="10"><og-eigenschaften><ueberschrift>Haus A</ueberschrift></og-eigenschaften>${LB}<svb/><lg-liste><lg nr="20"><lg-eigenschaften><ueberschrift>Erdarbeiten</ueberschrift></lg-eigenschaften>`
      + `<ulg-liste><ulg nr="30"><ulg-eigenschaften><ueberschrift>Aushub</ueberschrift></ulg-eigenschaften><positionen><grundtextnr nr="40"><ungeteilteposition mfv="">${pos('Aushub', { einheit: 'm³', gesamt: '12.00' })}</ungeteilteposition></grundtextnr></positionen></ulg></ulg-liste>`
      + '</lg></lg-liste></og></og-liste></gliederung-og></entwurfs-lv></onlv>';
    const a = importOnlv(og);
    expect(a.items.map((i) => `${i.depth}:${i.code}`)).toEqual(['0:10', '1:20', '2:30', '3:10.20.30.40']);
    expect(a.schedule.predefinedType).toBe('BUDGET');

    const frei = `<?xml version="1.0" encoding="UTF-8"?><onlv xmlns="${NS2021}">${HEADER}<kostenschaetzungs-lv>${KENN()}<gliederung-posfrei>`
      + `<preiserstellungsverfahren>Preisangebotsverfahren</preiserstellungsverfahren><positionen><position nr="A-1.5">${pos('Freie Position', { gesamt: '5.00' })}</position></positionen>`
      + '</gliederung-posfrei></kostenschaetzungs-lv></onlv>';
    const b = importOnlv(frei);
    expect(b.items.map((i) => `${i.depth}:${i.rowType}:${i.code}`)).toEqual(['0:begrotingspost:A-1.5']);
    expect(b.items[0].normUnitPrice).toBe(5);
  });

  it('nummert ungeteilte posities met Mehrfachverwendung en zet pospreis zonder preisanteile op prijs/middel', () => {
    const xml = lgOnlv(
      `<grundtextnr nr="07"><ungeteilteposition mfv="">${pos('Kran', { einheit: 'Mo', menge: '2.00', gesamt: '1500.00' })}</ungeteilteposition>`
      + `<ungeteilteposition mfv="1">${pos('Kran (2. Bauteil)', { einheit: 'Mo', menge: '1.00', gesamt: '1500.00' })}</ungeteilteposition></grundtextnr>`,
    );
    const items = recalculateItems(importOnlv(xml).items);
    expect(items.filter((i) => i.rowType === 'begrotingspost').map((i) => i.code)).toEqual(['01.02.07', '01.02.071']);
    const kran = byCode(items, '01.02.07');
    expect(kran.unit).toBe('mnd');
    expect(kran.normUnitPrice).toBe(1500);
    expect(kran.laborPrice).toBeNull();
    expect(kran.total).toBeCloseTo(3000, 2);
    expect(getKostprijs(items)).toBeCloseTo(4500, 2);
  });

  it('vangt een gesamt die niet gelijk is aan de som van de preisanteile op in prijs/middel', () => {
    const xml = lgOnlv(`<grundtextnr nr="01"><ungeteilteposition mfv="">${pos('X', { menge: '1.00', pa1: '10.00', pa2: '20.00', gesamt: '31.00' })}</ungeteilteposition></grundtextnr>`);
    const it = recalculateItems(importOnlv(xml).items).find((i) => i.rowType === 'begrotingspost')!;
    expect(it.laborPrice).toBe(10);
    expect(it.materialPrice).toBe(20);
    expect(it.normUnitPrice).toBe(1);
    expect(it.unitPrice).toBeCloseTo(31, 2);
  });
});

describe('ÖNORM A 2063 (.onlv) import — positiesoorten, teksten, eenheden', () => {
  it('markeert Wahl- en Eventualpositionen, zet ze op N en meldt dat het totaal ze bevat', () => {
    const xml = lgOnlv(
      `<grundtextnr nr="01"><ungeteilteposition mfv="">${pos('Normal', { menge: '1.00', gesamt: '100.00' })}</ungeteilteposition></grundtextnr>`
      + `<grundtextnr nr="02"><ungeteilteposition mfv="">${pos('Eventual', { menge: '1.00', gesamt: '50.00', pzzv: '<eventualposition/>' })}</ungeteilteposition></grundtextnr>`
      + `<grundtextnr nr="03"><ungeteilteposition mfv="">${pos('Wahl', { menge: '1.00', gesamt: '25.00', pzzv: '<wahlposition><zz>01</zz><variantennummer>1</variantennummer></wahlposition>', wesentlich: true })}</ungeteilteposition></grundtextnr>`,
      { lvSumme: summe('lv-summe', '0.00', '100.00', '100.00') },
    );
    const res = importOnlv(xml);
    const items = recalculateItems(res.items);
    expect(byCode(items, '01.02.01').verrekenbaar).toBeNull();
    const ev = byCode(items, '01.02.02');
    expect(ev.verrekenbaar).toBe('N');
    expect(ev.quantity).toBe(1);
    expect(ev.normUnitPrice).toBe(50);
    expect(ev.notes.split('\n')[0]).toBe(POSART_MARKERS.eventual);
    const wahl = byCode(items, '01.02.03');
    expect(wahl.verrekenbaar).toBe('N');
    expect(wahl.notes.split('\n')).toEqual(['Wesentliche Position (W)', POSART_MARKERS.wahl]);
    // De LV-som in het bestand (100) telt alleen de normale positie: geen som-melding.
    expect(res.warningCodes?.map((c) => c.code)).toEqual(['wahlEventual']);
    expect(res.warningCodes?.[0].params).toEqual({ count: 2 });
    expect(getKostprijs(items)).toBeCloseTo(175, 2);
  });

  it('meldt een LV-som die afwijkt van de som van de posities', () => {
    const xml = lgOnlv(
      `<grundtextnr nr="01"><ungeteilteposition mfv="">${pos('A', { menge: '3.00', gesamt: '10.00' })}</ungeteilteposition></grundtextnr>`,
      { lvSumme: summe('lv-summe', '0.00', '31.00', '31.00') },
    );
    const res = importOnlv(xml);
    expect(res.warningCodes?.[0]).toEqual({ code: 'sumMismatch', params: { file: '31.00', calculated: '30.00' } });
    expect(res.warnings[0]).toContain('31.00');
  });

  it('zet een wählbare Vorbemerkung (positie zonder einheit) om in een tekstregel', () => {
    const xml = lgOnlv(
      '<grundtextnr nr="01"><ungeteilteposition mfv=""><pos-eigenschaften><stichwort>Bauzeit</stichwort><langtext><p>Die Bauzeit beträgt <al>12</al> Wochen.</p></langtext></pos-eigenschaften></ungeteilteposition></grundtextnr>'
      + `<grundtextnr nr="02"><ungeteilteposition mfv="">${pos('Echte Position', { gesamt: '1.00' })}</ungeteilteposition></grundtextnr>`,
    );
    const res = importOnlv(xml);
    const wvb = byCode(res.items, '01.02.01');
    expect(wvb.rowType).toBe('tekstregel');
    expect(wvb.description).toBe('Bauzeit');
    expect(wvb.notes).toBe('Die Bauzeit beträgt 12 Wochen.');
    expect(byCode(res.items, '01.02.02').rowType).toBe('begrotingspost');
  });

  it('zet opgemaakte langtext om: alinea\'s, br, lijsten, tabellen, Lücken en Rechenwerte', () => {
    const langtext = '<p>Erste <b>Zeile</b>, <i>kursiv</i>, H<sub>2</sub>O, m<sup>2</sup>.<br/>Zweite Zeile</p><p/>'
      + '<ul><li>Punkt eins</li><li>Punkt <u>zwei</u></li></ul><ol><li>Nummer</li></ol>'
      + '<table width="100%" border="1"><tr><td>Farbe:</td><td><al/></td></tr><tr><td>Menge:</td><td><bl>7</bl></td></tr></table>'
      + '<h3>Überschrift</h3><p>Kakaoanteil <rw kennung="X" parameterlistenkennung="Y">40</rw> %, Lücke <blo/>, <al kennung="N">Farbe rot</al>.</p>';
    const xml = lgOnlv(`<grundtextnr nr="01"><ungeteilteposition mfv="">${pos('Text', { langtext, gesamt: '1.00' })}</ungeteilteposition></grundtextnr>`);
    const res = importOnlv(xml);
    expect(byCode(res.items, '01.02.01').notes.split('\n')).toEqual([
      'Erste Zeile, kursiv, H2O, m2.',
      'Zweite Zeile',
      '- Punkt eins',
      '- Punkt zwei',
      '- Nummer',
      'Farbe: | ____',
      'Menge: | 7',
      'Überschrift',
      'Kakaoanteil 40 %, Lücke ____, Farbe rot.',
    ]);
    expect(res.warningCodes?.map((c) => c.code)).toContain('luecken');
  });

  it('gebruikt stichwort-kurz + Stichwortlücke en valt terug op de eerste tekstregel', () => {
    const xml = lgOnlv(
      `<grundtextnr nr="01"><ungeteilteposition mfv="">${pos('X', { gesamt: '1.00' }).replace('<stichwort>X</stichwort>', '<stichwort-kurz>Fliesen Farbe:</stichwort-kurz><stichwort-luecke></stichwort-luecke>')}</ungeteilteposition></grundtextnr>`
      + `<grundtextnr nr="02"><ungeteilteposition mfv="">${pos('Y', { gesamt: '1.00' }).replace('<stichwort>Y</stichwort>', '<stichwort-kurz>Fliesen Farbe:</stichwort-kurz><stichwort-luecke>weiß</stichwort-luecke>')}</ungeteilteposition></grundtextnr>`,
    );
    const res = importOnlv(xml);
    expect(byCode(res.items, '01.02.01').description).toBe('Fliesen Farbe: ____');
    expect(byCode(res.items, '01.02.02').description).toBe('Fliesen Farbe: weiß');
  });

  it('zet ÖNORM-eenheden om en laat onbekende ongewijzigd staan met een melding', () => {
    const units = ['m', 'm²', 'm³', 'kg', 't', 'Stk', 'PA', 'h', 'd', 'Wo', 'Mo', 'km', 'VE', 'l', 'g', 'cm'];
    const positionen = units.map((u, i) => `<grundtextnr nr="${String(i + 1).padStart(2, '0')}"><ungeteilteposition mfv="">${pos(u, { einheit: u, gesamt: '1.00' })}</ungeteilteposition></grundtextnr>`).join('');
    const res = importOnlv(lgOnlv(positionen));
    const got = res.items.filter((i) => i.rowType === 'begrotingspost').map((i) => i.unit);
    expect(got).toEqual(['m', 'm²', 'm³', 'kg', 'ton', 'st', 'post', 'uur', 'dgn', 'week', 'mnd', 'km', 'VE', 'l', 'g', 'cm']);
    const unknown = res.warningCodes?.find((c) => c.code === 'unknownUnit');
    expect(unknown?.params).toEqual({ count: 4, examples: 'VE, l, g, cm' });
  });

  it('accepteert de namespaces 2015-07-15 en 2021-03-01 en een UTF-8 BOM', () => {
    const body = `<grundtextnr nr="01"><ungeteilteposition mfv="">${pos('Alt', { gesamt: '2.00' })}</ungeteilteposition></grundtextnr>`;
    const oud = importOnlv(lgOnlv(body, { ns: NS2015 }));
    const nieuw = importOnlv(lgOnlv(body, { ns: NS2021 }));
    expect(oud.items.map((i) => i.code)).toEqual(nieuw.items.map((i) => i.code));
    const bom = importOnlvFile(new TextEncoder().encode(`﻿${lgOnlv(body)}`).buffer as ArrayBuffer);
    expect(bom.items.map((i) => i.code)).toEqual(nieuw.items.map((i) => i.code));
  });

  it('weigert XML dat geen A 2063 is', () => {
    expect(() => importOnlv('<?xml version="1.0"?><Calculatie/>')).toThrow(/onlv|onlb/);
  });
});

describe('ÖNORM A 2063 (.onlb) import — Leistungsbuch', () => {
  const ONLB = `<?xml version="1.0" encoding="UTF-8"?><onlb xmlns="${NS2021}">${META}<lbkenndaten><bezeichnung>Leistungsbeschreibung Test</bezeichnung>`
    + '<herausgeber><firma><name>Ministerium</name></firma></herausgeber><lbkennung>TB</lbkennung><versionsnummer>3</versionsnummer><versionsdatum>2025-12-31</versionsdatum><status>freigegeben</status></lbkenndaten>'
    + '<svb><vorbemerkung><p>Ständige Vorbemerkung.</p></vorbemerkung><aenderungskennzeichnungen><lbversion>3</lbversion></aenderungskennzeichnungen></svb>'
    + '<lg-liste><lg nr="21"><lg-eigenschaften><ueberschrift>Dachabdichtung</ueberschrift><vorbemerkung><p>Version 3</p></vorbemerkung><aenderungskennzeichnungen><lbversion>3</lbversion></aenderungskennzeichnungen></lg-eigenschaften>'
    + '<ulg-liste><ulg nr="01"><ulg-eigenschaften><ueberschrift>Bahnen</ueberschrift><aenderungskennzeichnungen><lbversion>3</lbversion></aenderungskennzeichnungen></ulg-eigenschaften><positionen>'
    + '<grundtextnr nr="01"><grundtext><langtext><p>Bitumenbahn verlegen,</p></langtext></grundtext>'
    + '<folgeposition ftnr="A"><pos-eigenschaften><stichwort>Bitumenbahn einlagig</stichwort><langtext><p>einlagig.</p></langtext><aenderungskennzeichnungen><lbversion>3</lbversion></aenderungskennzeichnungen><einheit>m²</einheit></pos-eigenschaften></folgeposition>'
    + '<folgeposition ftnr="B"><pos-eigenschaften><stichwort>Bitumenbahn zweilagig</stichwort><langtext><p>zweilagig, Farbe <al/>.</p></langtext><kommentar><p>Nur bei Flachdach.</p></kommentar><aenderungskennzeichnungen><lbversion>3</lbversion></aenderungskennzeichnungen><einheit>m²</einheit></pos-eigenschaften></folgeposition></grundtextnr>'
    + '<grundtextnr nr="51"><ungeteilteposition><pos-eigenschaften><stichwort>Regie Dachdecker</stichwort><aenderungskennzeichnungen><lbversion>3</lbversion></aenderungskennzeichnungen><einheit>h</einheit></pos-eigenschaften></ungeteilteposition></grundtextnr>'
    + '<grundtextnr nr="52"><ungeteilteposition><pos-eigenschaften><stichwort>Wählbare Vorbemerkung</stichwort><langtext><p>Gilt wenn gewählt.</p></langtext><aenderungskennzeichnungen><lbversion>3</lbversion></aenderungskennzeichnungen></pos-eigenschaften></ungeteilteposition></grundtextnr>'
    + '</positionen></ulg></ulg-liste></lg></lg-liste></onlb>';

  it('importeert een Leistungsbuch als prijsloze catalogus met hoeveelheid 0', () => {
    const res = importOnlv(ONLB);
    expect(res.format).toBe('onlv');
    expect(res.schedule.projectName).toBe('Leistungsbeschreibung Test');
    expect(res.schedule.projectNumber).toBe('TB-3');
    expect(res.schedule.author).toBe('Ministerium');
    expect(res.schedule.description).toBe('Ständige Vorbemerkung.');
    expect(res.items.map((i) => `${i.rowType}:${i.code}`)).toEqual([
      'chapter:21', 'chapter:01', 'begrotingspost:21.01.01A', 'begrotingspost:21.01.01B', 'begrotingspost:21.01.51', 'tekstregel:21.01.52',
    ]);
    const b = byCode(res.items, '21.01.01B');
    expect(b.quantity).toBe(0);
    expect(b.unit).toBe('m²');
    expect(b.notes).toBe('Bitumenbahn verlegen,\nzweilagig, Farbe ____.');
    expect(byCode(res.items, '21.01.51').unit).toBe('uur');
    expect(byCode(res.items, '21').notes).toBe('Version 3');
    expect(res.warningCodes?.map((c) => c.code)).toEqual(['leistungsbuch', 'luecken']);
    expect(getKostprijs(recalculateItems(res.items))).toBe(0);
  });

  it('meldingen hebben een en- en nl-vertaling en worden via de codes vertaald', () => {
    const codes = ['leistungsbuch', 'wahlEventual', 'sumMismatch', 'unknownUnit', 'noPrices', 'luecken'];
    const has = (bundle: Record<string, string>, code: string) =>
      code in bundle || (`${code}_one` in bundle && `${code}_other` in bundle);
    for (const code of codes) {
      expect(has(enDialogs.importWarnings.onlv as Record<string, string>, code), `en ${code}`).toBe(true);
      expect(has(nlDialogs.importWarnings.onlv as Record<string, string>, code), `nl ${code}`).toBe(true);
    }
    const res = importOnlv(ONLB);
    const tEn = ((key: string, opts?: Record<string, unknown>) => {
      const bundle = enDialogs.importWarnings.onlv as Record<string, string>;
      const short = key.replace(/^importWarnings\.onlv\./, '');
      const count = typeof opts?.count === 'number' ? opts.count : undefined;
      const raw = bundle[count === 1 ? `${short}_one` : `${short}_other`] ?? bundle[short] ?? (opts?.defaultValue as string);
      return raw.replace(/\{\{(\w+)\}\}/g, (_, k) => String(opts?.[k] ?? ''));
    }) as never;
    const lines = describeImportWarnings(res, tEn);
    expect(lines[0]).toMatch(/quantity 0/);
    expect(lines[1]).toMatch(/^1 position/);
  });
});

describe('ÖNORM A 2063 (.onlv) export', () => {
  const kale = (over: Partial<CostItem>): CostItem => ({
    id: over.id ?? Math.random().toString(36).slice(2), parentId: null, sortOrder: 0, code: '', description: '', unit: 'st',
    quantity: 1, materialPrice: null, laborPrice: null, unitPrice: 0, total: 0, isCollapsed: false, depth: 0, notes: '',
    ifcGuid: 'g', rowType: 'begrotingspost', staartPercentage: null, nr: '', normQuantity: null, normFactor: null,
    normDivisor: null, normUnitPrice: null, resourceType: null, resourceLibraryId: null, tariefGroep: null, verrekenbaar: null,
    ...over,
  });

  it('schrijft een kostenschaetzungs-lv met lg/ulg, Lohn/Sonstiges en sommen die de import terugleest', () => {
    const items = recalculateItems([
      kale({ id: 'h', rowType: 'chapter', code: '01', description: 'Grondwerk', notes: 'Vorbemerkung hoofdstuk' }),
      kale({ id: 'p1', parentId: 'h', code: '01.01', description: 'Ontgraven', unit: 'm³', quantity: 92, normUnitPrice: 20, laborPrice: 5 }),
      kale({ id: 'p2', parentId: 'h', code: '01.02', description: 'Aanvullen', unit: 'm³', quantity: 10.5, materialPrice: 8, verrekenbaar: 'N' }),
      kale({ id: 't', parentId: 'h', rowType: 'tekstregel', code: '', description: 'Let op de grondwaterstand.', notes: 'Bemaling apart.' }),
      kale({ id: 's', rowType: 'staart_ak', staartPercentage: 8 }),
    ]);
    const { xml, warnings, lvType } = buildOnlv(schedule({ projectName: 'Woning', projectNumber: 'P-1', client: 'Klant BV', author: 'Jan' }), items, { now: new Date(2026, 0, 2, 3, 4, 5) });
    expect(lvType).toBe('kostenschaetzungs-lv');
    expect(xml).toContain(`xmlns="${NS2021}"`);
    expect(xml).toContain('<erstelltam>2026-01-02T03:04:05</erstelltam>');
    expect(xml).toContain('<lvcode>P-1</lvcode>');
    expect(xml).toContain('<name>Klant BV</name>');
    expect(xml).toContain('<ueberschrift>Grondwerk</ueberschrift>');
    expect(xml).toContain('<p>Vorbemerkung hoofdstuk</p>');
    expect(xml).toContain('<preisanteil1>5.00</preisanteil1>');
    expect(xml).toContain('<preisanteil2>20.00</preisanteil2>');
    expect(xml).toContain('<gesamt>25.00</gesamt>');
    expect(xml).toContain('<pospreis>2300.00</pospreis>');
    expect(xml).toContain('<eventualposition/>');
    expect(xml).toContain('<lvmenge>10.50</lvmenge>');
    expect(xml).toContain('<stichwort>Let op de grondwaterstand.</stichwort>');
    expect(xml).toContain('<summe-des-lv>2300.00</summe-des-lv>');
    expect(warnings.some((w) => w.includes('staartregel'))).toBe(true);

    const back = importOnlv(xml);
    const items2 = recalculateItems(back.items);
    expect(items2.map((i) => `${i.rowType}:${i.code}:${i.description}`)).toEqual([
      'chapter:01:Grondwerk', 'chapter:01:Grondwerk',
      'begrotingspost:01.01.01:Ontgraven', 'begrotingspost:01.01.02:Aanvullen', 'tekstregel:01.01.03:Let op de grondwaterstand.',
    ]);
    expect(byCode(items2, '01.01.01').laborPrice).toBe(5);
    expect(byCode(items2, '01.01.01').materialPrice).toBe(20);
    expect(byCode(items2, '01.01.01').total).toBeCloseTo(2300, 2);
    expect(byCode(items2, '01.01.02').verrekenbaar).toBe('N');
    expect(byCode(items2, '01.01.03').notes).toBe('Bemaling apart.');
    expect(back.schedule.client).toBe('Klant BV');
    expect(back.warningCodes?.map((c) => c.code)).toEqual(['wahlEventual']);
  });

  it('schrijft zonder prijzen een ausschreibungs-lv met nichtangeboten', () => {
    const items = recalculateItems([
      kale({ id: 'h', rowType: 'chapter', code: '01', description: 'Hoofdstuk' }),
      kale({ id: 'p1', parentId: 'h', code: '01.01', description: 'Post', quantity: 3 }),
    ]);
    const { xml, lvType } = buildOnlv(schedule({ name: 'Bestek' }), items);
    expect(lvType).toBe('ausschreibungs-lv');
    expect(xml).toContain('<nichtangeboten/>');
    expect(xml).not.toContain('<lv-summe>');
    expect(importOnlv(xml).warningCodes?.map((c) => c.code)).toEqual(['noPrices']);
  });

  it('gebruikt grundtext + folgeposition bij codes op het ÖNORM-patroon en bewaart de volgorde', () => {
    const items = recalculateItems([
      kale({ id: 'lg', rowType: 'chapter', code: '03', description: 'LG' }),
      kale({ id: 'ulg', parentId: 'lg', rowType: 'chapter', code: '02', description: 'ULG' }),
      kale({ id: 'a', parentId: 'ulg', code: '03.02.01A', description: 'A', normUnitPrice: 1 }),
      kale({ id: 'b', parentId: 'ulg', code: '03.02.01B', description: 'B', normUnitPrice: 1 }),
      kale({ id: 'c', parentId: 'ulg', code: '03.02.05', description: 'C', normUnitPrice: 1 }),
      kale({ id: 'd', parentId: 'ulg', code: '03.02.051', description: 'D (mfv 1)', normUnitPrice: 1 }),
      kale({ id: 'e', parentId: 'ulg', code: 'vrij', description: 'E', normUnitPrice: 1 }),
      kale({ id: 'f', parentId: 'ulg', code: '03.02.01C', description: 'F (later, zelfde grundtext)', normUnitPrice: 1 }),
    ]);
    const { xml } = buildOnlv(schedule({ name: 'X' }), items);
    expect(xml).toContain('<grundtextnr nr="01">');
    expect(xml).toContain('<folgeposition ftnr="A" mfv="">');
    expect(xml).toContain('<ungeteilteposition mfv="1">');
    const codes = importOnlv(xml).items.filter((i) => i.rowType === 'begrotingspost').map((i) => i.code);
    // E krijgt een vrij nummer; F kan niet meer bij grundtext 01 (niet aansluitend) en krijgt een nieuw grundtextnummer.
    expect(codes).toEqual(['03.02.01A', '03.02.01B', '03.02.05', '03.02.051', '03.02.02', '03.02.03C']);
  });

  it('kiest het aantal niveaus op de hoofdstukdiepte: 1 → lg + ulg, 3 → og/lg/ulg, 4 → hg/og/lg/ulg, dieper → platgeslagen', () => {
    const one = recalculateItems([
      kale({ id: 'h', rowType: 'chapter', code: '7', description: 'Enkel' }),
      kale({ id: 'p', parentId: 'h', code: 'x', description: 'P', normUnitPrice: 1 }),
      kale({ id: 'los', code: 'los', description: 'Losse post', normUnitPrice: 2 }),
    ]);
    const a = importOnlv(buildOnlv(schedule({ name: 'N' }), one).xml);
    expect(a.items.map((i) => `${i.depth}:${i.rowType}:${i.code}`)).toEqual([
      '0:chapter:01', '1:chapter:01', '2:begrotingspost:01.01.01', '0:chapter:07', '1:chapter:01', '2:begrotingspost:07.01.01',
    ]);

    const deep = recalculateItems([
      kale({ id: '1', rowType: 'chapter', code: '01', description: 'HG' }),
      kale({ id: '2', parentId: '1', rowType: 'chapter', code: '02', description: 'OG', notes: 'OG-Vorbemerkung' }),
      kale({ id: '3', parentId: '2', rowType: 'chapter', code: '03', description: 'LG' }),
      kale({ id: '4', parentId: '3', rowType: 'chapter', code: '04', description: 'ULG' }),
      kale({ id: '5', parentId: '4', rowType: 'chapter', code: '05', description: 'Te diep' }),
      kale({ id: 'p', parentId: '5', code: '06', description: 'Post', normUnitPrice: 1 }),
    ]);
    const r = buildOnlv(schedule({ name: 'N' }), deep);
    expect(r.xml).toContain('<gliederung-hg>');
    expect(r.warnings.some((w) => w.includes('platgeslagen'))).toBe(true);
    const b = importOnlv(r.xml);
    expect(b.items.map((i) => `${i.depth}:${i.rowType}:${i.code}:${i.description}`)).toEqual([
      '0:chapter:01:HG', '1:chapter:02:OG', '2:chapter:03:LG', '3:chapter:04:ULG',
      '4:tekstregel:01.02.03.04.01:Te diep', '4:begrotingspost:01.02.03.04.06:Post',
    ]);
    expect(b.schedule.description).toBe('OG-Vorbemerkung');

    const three = recalculateItems([
      kale({ id: '1', rowType: 'chapter', code: '01', description: 'OG' }),
      kale({ id: '2', parentId: '1', rowType: 'chapter', code: '02', description: 'LG' }),
      kale({ id: '3', parentId: '2', rowType: 'chapter', code: '03', description: 'ULG' }),
      kale({ id: 'p', parentId: '3', code: '04', description: 'Post', normUnitPrice: 1 }),
    ]);
    expect(buildOnlv(schedule({ name: 'N' }), three).xml).toContain('<gliederung-og>');
  });

  it('vouwt rekenregels in de prijs van de post (loon → preisanteil1) en kort lange teksten op 60 tekens in', () => {
    const long = 'Een omschrijving die veel langer is dan zestig tekens en dus ingekort moet worden in het stichwort';
    const items = recalculateItems([
      kale({ id: 'h', rowType: 'chapter', code: '01', description: 'H' }),
      kale({ id: 'p', parentId: 'h', code: '01.01', description: long, unit: 'm²', quantity: 10 }),
      kale({ id: 'r1', parentId: 'p', rowType: 'regel', code: 'A', description: 'Arbeid', unit: 'uur', quantity: 10, normQuantity: 0.5, normFactor: 1, normUnitPrice: 40, resourceType: 'arbeid' }),
      kale({ id: 'r2', parentId: 'p', rowType: 'regel', code: 'M', description: 'Materiaal', unit: 'kg', quantity: 10, normQuantity: 2, normFactor: 1, normUnitPrice: 3, resourceType: 'materiaal' }),
    ]);
    const { xml, warnings } = buildOnlv(schedule({ name: 'N' }), items);
    expect(xml).toContain(`<stichwort>${long.slice(0, 60)}</stichwort>`);
    expect(xml).toContain(`<p>${long}</p>`);
    expect(xml).toContain('<preisanteil1>20.00</preisanteil1>');
    expect(xml).toContain('<preisanteil2>6.00</preisanteil2>');
    expect(xml).toContain('<pospreis>260.00</pospreis>');
    expect(warnings.some((w) => w.includes('rekenregel'))).toBe(true);
    expect(warnings.some((w) => w.includes('60 tekens'))).toBe(true);
    const back = recalculateItems(importOnlv(xml).items);
    expect(getKostprijs(back)).toBeCloseTo(260, 2);
  });

  it('escapet XML-tekens en zet OCS-eenheden om', () => {
    const items = recalculateItems([
      kale({ id: 'h', rowType: 'chapter', code: '01', description: 'A & B <C>' }),
      kale({ id: 'p', parentId: 'h', code: '01.01', description: 'Post "x"', unit: 'post', quantity: 1, normUnitPrice: 1, notes: 'a < b' }),
      kale({ id: 'q', parentId: 'h', code: '01.02', description: 'Uur', unit: 'uur', quantity: 1, normUnitPrice: 1 }),
      kale({ id: 'r', parentId: 'h', code: '01.03', description: 'Onbekend', unit: 'zak' as never, quantity: 1, normUnitPrice: 1 }),
    ]);
    const { xml, warnings } = buildOnlv(schedule({ name: 'N' }), items);
    expect(xml).toContain('<ueberschrift>A &amp; B &lt;C&gt;</ueberschrift>');
    expect(xml).toContain('<p>a &lt; b</p>');
    expect(xml).toContain('<einheit>PA</einheit>');
    expect(xml).toContain('<einheit>h</einheit>');
    expect(xml).toContain('<einheit>Stk</einheit>');
    expect(warnings.some((w) => w.includes('Stk'))).toBe(true);
  });

  it('a2063TextLines geeft een lege lijst voor null', () => {
    expect(a2063TextLines(null)).toEqual([]);
  });
});
