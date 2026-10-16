// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { convertToIfcCalc, convertFromIfcCalc, importXmlBudget } from '../lib/converters';
import { deserializeProject, calculateProject } from '../lib/core';

const xpwe = `<PweDocumento><PweDatiGenerali><PweDGProgetto><PweDGDatiGenerali><Oggetto>House &amp; roof</Oggetto></PweDGDatiGenerali></PweDGProgetto></PweDatiGenerali><PweMisurazioni><PweElencoPrezzi><EPItem ID="1"><Tariffa>A</Tariffa><DesEstesa>Wall</DesEstesa><UnMisura>mq</UnMisura><Prezzo1>12.50</Prezzo1><Unknown>preserve</Unknown></EPItem></PweElencoPrezzi><PweVociComputo><VCItem ID="1"><IDEP>1</IDEP><Quantita>2</Quantita></VCItem><VCItem ID="2"><IDEP>1</IDEP><Quantita>3</Quantita></VCItem></PweVociComputo></PweMisurazioni></PweDocumento>`;
const xc4 = `<XC4><verze>4.4</verze><stavba><nazev>Road</nazev><objekty><objekt><znacka>1</znacka><nazev>Site</nazev><stavDily><stavDil><znacka>A</znacka><nazev>Work</nazev><polozky><polozka><id_polozka>id1</id_polozka><znacka>001</znacka><nazev>Excavation</nazev><id_mj>m3</id_mj><mnozstvi>2.5</mnozstvi><joc>100</joc><vymera>formula</vymera><custom>keep</custom></polozka></polozky></stavDil></stavDily></objekt></objekty></stavba></XC4>`;
const project = (text: string) => deserializeProject(new TextDecoder().decode(convertToIfcCalc(text,'source.xml').data));
const decode = (data: Uint8Array) => new TextDecoder().decode(data);

describe('bidirectional international budget conversion', () => {
  it.each([[xpwe,'xpwe'],[xc4,'xc4']] as const)('returns original source byte-for-byte without tax/overhead injection (%s)', (source,format) => {
    const p = project(source);
    expect(p.items.some(i => i.rowType.startsWith('staart_'))).toBe(false);
    expect(decode(convertFromIfcCalc(JSON.stringify(p),format).data)).toBe(source);
    expect(p.schedule.budgetExchange?.source).toBe(source);
  });
  it('maps direct prices into calculator inputs', () => {
    const p = calculateProject(project(xpwe));
    expect(p.items.map(i => i.total)).toEqual([25,37.5]);
    expect(decode(convertFromIfcCalc(p,'xpwe').data)).toBe(xpwe);
  });
  it('clones shared XPWE price references when one item changes', () => {
    const p = project(xpwe);
    p.items[0].materialPrice = 20;
    p.items[0].description = 'A < B & C';
    const output = decode(convertFromIfcCalc(p,'xpwe').data);
    const re = importXmlBudget(output);
    expect(re.items.map(i => i.materialPrice)).toEqual([20,12.5]);
    expect(re.items[0].description).toBe('A < B & C');
    expect(output).toContain('<Unknown>preserve</Unknown>');
    expect(p.schedule.budgetExchange?.source).toBe(xpwe);
  });
  it('updates quantities, notes and prices while preserving unknown XC4 fields', () => {
    const p = project(xc4);
    const item = p.items.find(i => i.rowType === 'begrotingspost')!;
    item.quantity = 4; item.materialPrice = 50; item.notes = 'New note';
    const out = convertFromIfcCalc(p,'xc4');
    const text = decode(out.data);
    const re = importXmlBudget(text);
    expect(re.items[re.items.length-1]?.total).toBe(200);
    expect(re.items[re.items.length-1]?.notes).toBe('New note');
    expect(text).toContain('<custom>keep</custom>');
    expect(text).toContain('<vymera></vymera>');
    expect(out.warnings.some(s => s.includes('Measurement'))).toBe(true);
  });
  it('does not silently drop new rows, change currencies or export without a matching template', () => {
    const p = project(xpwe);
    p.items.push({...p.items[0],id:'new'});
    expect(() => convertFromIfcCalc(p,'xpwe')).toThrow(/rows/);
    p.items.pop(); p.schedule.currency = 'USD';
    expect(() => convertFromIfcCalc(p,'xpwe')).toThrow(/currency/);
    expect(() => convertFromIfcCalc(p,'xc4')).toThrow(/requires/);
  });
  it('retains missing prices as null and rejects malformed numbers and references', () => {
    expect(importXmlBudget(xpwe.replace('12.50','')).items[0].materialPrice).toBeNull();
    expect(() => importXmlBudget(xpwe.replace('12.50','12abc'))).toThrow(/Invalid number/);
    expect(() => importXmlBudget(xpwe.replace('<IDEP>1','<IDEP>99'))).toThrow(/missing price/);
    expect(() => importXmlBudget(xc4.replace('4.4','9.0'))).toThrow(/version/);
  });
});

describe('normalized table exchange', () => {
  it.each(['csv','xlsx'] as const)('preserves quantities, prices, hierarchy and multiline text through %s', format => {
    const p = project(xc4);
    p.items[2].description = 'Quoted "text"\nsecond line';
    p.items[2].materialPrice = null;
    const table = convertFromIfcCalc(p,format);
    const round = deserializeProject(decode(convertToIfcCalc(table.data,`budget.${format}`).data));
    expect(round.items.map(i => [i.code,i.parentId,i.quantity,i.materialPrice,i.description])).toEqual(p.items.map(i => [i.code,i.parentId,i.quantity,i.materialPrice,i.description]));
    expect(round.items.some(i => i.rowType.startsWith('staart_'))).toBe(false);
    expect(round.schedule.currency).toBe('CZK');
    expect(round.items[2].depth).toBe(2);
  });
  it('refuses formula-like CSV text but preserves it as text in XLSX', () => {
    const p = project(xpwe); p.items[0].description = '=HYPERLINK("example")';
    expect(() => convertFromIfcCalc(p,'csv')).toThrow(/Formula-like/);
    const data = convertFromIfcCalc(p,'xlsx').data;
    const round = deserializeProject(decode(convertToIfcCalc(data,'table.xlsx').data));
    expect(round.items[0].description).toBe(p.items[0].description);
  });
  it('requires an explicit profile for regional sheets and accepts decimal commas', () => {
    const csv = 'Code;Omschrijving;Eenheid;Aantal;Prijs\n001;Muur;m2;2,5;20,00';
    expect(() => convertToIfcCalc(csv,'regional.csv')).toThrow(/profile/i);
    const out = convertToIfcCalc(csv,'regional.csv',{profile:{sheet:'Sheet1',firstRow:2,lastRow:2,currency:'EUR',decimalSeparator:',',columns:{code:0,description:1,unit:2,quantity:3,price:4}}});
    const p = deserializeProject(decode(out.data));
    expect(p.items[0].code).toBe('001');
    expect(p.items[0].total).toBe(50);
  });
});

it('preserves the UTF-8 BOM on byte input and return output', () => {
  const bytes = new TextEncoder().encode('\uFEFF'+xc4);
  const native = convertToIfcCalc(bytes,'source.xml');
  const out = convertFromIfcCalc(new TextDecoder().decode(native.data),'xc4');
  expect(out.data).toEqual(bytes);
});
