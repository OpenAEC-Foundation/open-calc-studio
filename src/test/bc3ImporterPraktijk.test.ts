import { describe, it, expect } from 'vitest';
import { importBc3, decodeBc3, importBc3File } from '@/services/importers/bc3Importer';
import { recalculateItems, getKostprijs } from '@/services/calculation/calculator';

/**
 * Afwijkingen die in echte .bc3-bestanden voorkomen. De fragmenten zijn
 * modellen van publieke bestanden uit Presto, Arquímedes/CYPE, TCQ, SISPRE en
 * de Base de Costes de la Construcción de Andalucía; elk exemplaar hier hoort
 * bij een bug die op zulke bestanden aan het licht kwam.
 */
describe('FIEBDC-3 (.bc3) praktijkafwijkingen', () => {
  const bytes = (s: string): ArrayBuffer => {
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
    return out.buffer;
  };

  it('herkent codes die met CRLF worden afgebroken vóór het scheidingsteken', () => {
    // Arquímedes/Presto knippen lange records af; de code eindigt dan op CRLF
    // en de #-suffix staat niet meer aan het einde van de string.
    const src = [
      '~V||FIEBDC-3/2004|ARQUIMEDES||ANSI|Presupuesto|2|',
      '~C|URBANIZACION##||PROYECTO DE URBANIZACION|100.00|010602|0|',
      '~C|CAPITULO1#||MOVIMIENTO DE TIERRAS|100.00|010602|0|',
      '~C|U01|m3|Excavación|10.00|010602|0|',
      '~D|URBANIZACION##\r\n|CAPITULO1#\\1\\1\\|',
      '~D|CAPITULO1#\r\n|U01\\1\\1\\|',
      '~M|CAPITULO1#\\U01|1\\1\\|10.00||',
    ].join('\r\n');
    const res = importBc3(src);
    expect(res.schedule.projectName).toBe('PROYECTO DE URBANIZACION');
    expect(res.items.map((i) => i.rowType)).toEqual(['chapter', 'begrotingspost']);
    expect(res.items[1].quantity).toBe(10);
  });

  it('leest UTF-8 ook als het ~V-record ANSI zegt', () => {
    // Presto 22 schrijft UTF-8 met "ANSI" in de kop.
    const src = '~V|RIB Spain|FIEBDC-3/2020|Pr22.03||ANSI||2||||\r\n'
      + '~C|X##||BAJA ADJUDICACIÓN|1.00||0|\r\n';
    const utf8 = new TextEncoder().encode(src);
    expect(decodeBc3(utf8.buffer as ArrayBuffer)).toContain('ADJUDICACIÓN');
  });

  it('leest CP850 als het ~V-record geen tekenset noemt (FIEBDC-3/95)', () => {
    // 0xA2 = ó en 0xA1 = í in CP850; in Windows-1252 zijn dat ¢ en ¡.
    const src = '~V|Iturribizia, S.L.|FIEBDC-3/95|ppl 0.1|\r\n'
      + '~C|PR##||Excavaci\xA2n de tuber\xA1a|1.00|040400|0|\r\n';
    expect(decodeBc3(bytes(src))).toContain('Excavación de tubería');
  });

  it('ziet subhoofdstukken zonder #-suffix aan de lege eenheid', () => {
    // FIEBDC-3/95: alleen het eerste niveau krijgt een #, dieper niet.
    const src = [
      '~V|Iturribizia, S.L.|FIEBDC-3/95|ppl 0.1|',
      '~C|PR##||Prueba|100|040400|0|',
      '~C|1#||Tubería y camino de servicio.|100|040400|0|',
      '~C|1_1||Movimiento de tierras.|100|040400|0|',
      '~C|02.001|M3|Excavación en tierra vegetal|10|040400|0|',
      '~C|01007|H|Peón ordinario.|8|040400|1|',
      '~D|PR##|1\\1\\1\\|',
      '~D|1#|1_1\\1\\1\\|',
      '~D|1_1|02.001\\1\\10\\|',
      '~D|02.001|01007\\1\\1.25\\|',
      '~M|1_1\\02.001|1\\1\\1\\|10|',
    ].join('\r\n');
    const res = importBc3(src);
    expect(res.items.map((i) => `${i.rowType}:${i.code}`)).toEqual([
      'chapter:1', 'chapter:1_1', 'begrotingspost:02.001', 'regel:01007',
    ]);
    expect(res.items[2].quantity).toBe(10);
  });

  it('rekent een percentageregel over de voorgaande regels', () => {
    // SISPRE/Presto: %CI is een opslag, het rendement is de fractie.
    const src = [
      '~V|SOFT S.A.|FIEBDC-3/95|Presto 7.00|',
      '~C|PR##||Obra|77.98|181099|0|',
      '~C|CAP#||Capítulo|77.98|181099|0|',
      '~C|0001|M2|Acondicionamiento de terrenos|77.98|181099|0|',
      '~C|02.001|H|Pala cargadora.|5538|181099|0|',
      '~C|02.002|H|Camión volquete.|2900|181099|0|',
      '~C|01.004|H|Peón albañilería.|1125|181099|0|',
      '~C|%CI||COSTE INDIRECTO.|6|181099|2|',
      '~D|PR##|CAP#\\1\\1\\|',
      '~D|CAP#|0001\\1\\1\\|',
      '~D|0001|02.001\\1\\.005\\02.002\\1\\.01\\01.004\\1\\.015\\%CI\\1\\.06\\|',
      '~M|CAP#\\0001|1\\1\\|1|',
    ].join('\r\n');
    const items = recalculateItems(importBc3(src).items);
    // 27,69 + 29,00 + 16,875 = 73,565 → +6% = 77,98
    expect(items.find((i) => i.code === '0001')!.total).toBeCloseTo(77.98, 2);
    const opslag = items.find((i) => i.code === '%CI')!;
    expect(opslag.normQuantity).toBeCloseTo(0.06, 6);
    expect(opslag.normUnitPrice).toBeCloseTo(73.565, 3);
  });

  it('laat een %-code die géén opslag is met rendement × prijs staan', () => {
    // Zelfde vorm als hierboven, maar hier reproduceert alleen rendement ×
    // prijs de eenheidsprijs op het ~C-record.
    const src = [
      '~V|Iturribizia, S.L.|FIEBDC-3/95|ppl 0.1|',
      '~C|PR##||Prueba|156.31|040400|0|',
      '~C|CAP#||Capítulo|156.31|040400|0|',
      '~C|02.001|M3|Excavación en tierra vegetal|156.31|040400|0|',
      '~C|02008|H|Camión basculante 10 m3|3486|040400|2|',
      '~C|01007|H|Peón ordinario.|819|040400|1|',
      '~C|%7||Costes indirectos |7|040400|1|',
      '~D|PR##|CAP#\\1\\1\\|',
      '~D|CAP#|02.001\\1\\1\\|',
      '~D|02.001|02008\\1\\0.04\\01007\\1\\0.02\\%7\\1\\0.07\\|',
      '~M|CAP#\\02.001|1\\1\\|1|',
    ].join('\r\n');
    const items = recalculateItems(importBc3(src).items);
    // 139,44 + 16,38 + 0,49 = 156,31 (en niet 155,82 × 1,07 = 166,73)
    expect(items.find((i) => i.code === '02.001')!.total).toBeCloseTo(156.31, 2);
  });

  it('houdt twee hoofdstukken met dezelfde code uit elkaar', () => {
    // Ppl-export: 4.1# staat er twee keer, alleen de volgorde onderscheidt ze.
    const src = [
      '~V|Iturribizia, S.L.|FIEBDC-3/95|ppl 0.1|',
      '~C|PB##||Planta|30|040400|0|',
      '~C|4#||Red eléctrica|30|040400|0|',
      '~C|4.1#||Alumbrado|10|040400|0|',
      '~C|240.001|ud|Cuadro|10|040400|0|',
      '~Y|4.1|240.001\\1\\1\\|',
      '~M|4.1\\240.001|1\\1\\1\\|1|',
      '~C|4.1#||Fuerza|20|040400|0|',
      '~Y|4.1|240.001\\1\\1\\|',
      '~M|4.1\\240.001|1\\2\\1\\|2|',
      '~D|PB##|4\\1\\1\\|',
      '~D|4#|4.1\\1\\1\\4.1\\1\\1\\|',
    ].join('\r\n');
    const items = recalculateItems(importBc3(src).items);
    const hoofdstukken = items.filter((i) => i.rowType === 'chapter');
    expect(hoofdstukken.map((h) => h.description)).toEqual(['Red eléctrica', 'Alumbrado', 'Fuerza']);
    // De meting hangt aan het positiepad, niet aan de (dubbele) code.
    expect(items.filter((i) => i.code === '240.001').map((i) => i.quantity)).toEqual([1, 2]);
    expect(getKostprijs(items)).toBeCloseTo(30, 2);
  });

  it('geeft dezelfde partida twee keer in één hoofdstuk elk zijn eigen meting', () => {
    const src = [
      '~V|Iturribizia, S.L.|FIEBDC-3/95|ppl 0.1|',
      '~C|PB##||Planta|300|040400|0|',
      '~C|31#||Saneamiento|300|040400|0|',
      '~C|220.008|ud|Pozo de registro|100|040400|0|',
      '~D|PB##|31\\1\\1\\|',
      '~Y|31|220.008\\1\\1\\220.008\\1\\1\\|',
      '~M|31\\220.008|1\\1\\|1|',
      '~M|31\\220.008|1\\2\\|2|',
    ].join('\r\n');
    const items = recalculateItems(importBc3(src).items);
    expect(items.filter((i) => i.code === '220.008').map((i) => i.quantity)).toEqual([1, 2]);
    expect(getKostprijs(items)).toBeCloseTo(300, 2);
  });

  it('valt terug op de eigen prijs bij een samenstelling zonder rendementen', () => {
    // Presto 8.8-export: de samenstelling staat er wel, maar alle rendementen
    // zijn 0. Dan is de prijs op het ~C-record de enige bruikbare bron.
    const src = [
      '~V|SOFT S.A.|FIEBDC-3/2002|Presto 8.8||ANSI|',
      '~C|PA11##||INSTALACION DE ASCENSOR|602.31|190825|0|',
      '~C|C02.00#||URBANIZACIÓN|602.31|190825|0|',
      '~C|D02HF010|M3|EXCAVACION ZAPATAS CORRIDAS|122.42|190825|0|',
      '~C|U01AA011|h|Peón suelto|15.00|190825|1|',
      '~C|%CI|%|Costes indirectos..(s/total)|86|080208|0|',
      '~D|PA11##|C02.00\\1\\1\\|',
      '~D|C02.00#|D02HF010\\1\\4.92\\|',
      '~D|D02HF010|U01AA011\\1\\0\\%CI\\1\\0.03\\|',
      '~M|C02.00#\\D02HF010|1\\1\\|4.92|',
    ].join('\r\n');
    const res = importBc3(src);
    const items = recalculateItems(res.items);
    expect(items.filter((i) => i.rowType === 'regel')).toHaveLength(0);
    expect(items.find((i) => i.code === 'D02HF010')!.total).toBeCloseTo(122.42 * 4.92, 2);
    expect(res.warnings.some((w) => w.includes('zonder rendementen'))).toBe(true);
  });

  it('meldt partidas waarvan de samenstelling niet op de eigen prijs uitkomt', () => {
    const src = [
      '~V|Iturribizia, S.L.|FIEBDC-3/95|ppl 0.1|',
      '~C|PR##||Prueba|1|040400|0|',
      '~C|CAP#||Capítulo|1|040400|0|',
      '~C|1201|ud|Turbina Francis|1|040400|0|',
      '~C|SINDESCO|***|Unidad sin descompuesto|1|040400|1|',
      '~D|PR##|CAP#\\1\\1\\|',
      '~D|CAP#|1201\\1\\1\\|',
      '~D|1201|SINDESCO\\1\\134299606\\|',
      '~M|CAP#\\1201|1\\1\\|1|',
    ].join('\r\n');
    const res = importBc3(src);
    expect(res.warnings.some((w) => w.includes('1201'))).toBe(true);
    expect(recalculateItems(res.items).find((i) => i.code === '1201')!.total).toBeCloseTo(134299606, 0);
  });

  it('crasht niet op records die de importer niet kent', () => {
    // ~L, ~X, ~P, ~K en ~A komen in echte bestanden voor.
    const src = [
      '~V|RIB Spain|FIEBDC-3/2020\\01112023|Presto 22.01||ANSI||2||||',
      '~L||ESP\\Especificación\\TEC\\Características técnicas\\|',
      '~K|\\2\\3\\3\\2\\2\\2\\2\\EUR\\|13\\0\\0\\0\\21|3\\2\\\\3\\3\\|',
      '~X||eCO2\\Emisión de CO2\\kg\\v\\|',
      '~P|AAA010$|#1 Definición Parámetros\\DIÁMETRO\\=<0,15 m\\|',
      '~A|OBRA##|CLI\\Cliente\\|',
      '~C|OBRA##||Obra|10.00||0|',
      '~C|CAP#||Capítulo|10.00||0|',
      '~C|P1|m2|Partida|10.00||0|',
      '~D|OBRA##|CAP#\\1\\1\\|',
      '~D|CAP#|P1\\1\\1\\|',
      '~M|CAP#\\P1|1\\1\\|1|',
    ].join('\r\n');
    const res = importBc3(src);
    expect(res.items.map((i) => i.rowType)).toEqual(['chapter', 'begrotingspost']);
    expect(getKostprijs(recalculateItems(res.items))).toBeCloseTo(10, 2);
  });

  it('telt een decompositieregel met rendement 0 niet mee', () => {
    // BCCA, Arquímedes: één regel van de samenstelling heeft rendement 0 en
    // telt in het bestand niet mee. De calculator leest norm 0 als "directe
    // prijs" (aantal × prijs); daarom krijgt zo'n regel aantal 0.
    const src = [
      '~V||FIEBDC-3/2004|X||ANSI|',
      '~C|PR##||Obra|20||0|',
      '~C|CAP#||Capítulo|20||0|',
      '~C|0001|m2|Partida|10||0|',
      '~C|MO|h|Peón|10||1|',
      '~C|MAT|kg|Cemento|99||3|',
      '~C|%003|%|3 % Medios auxiliares|0||%|',
      '~D|PR##|CAP#\\1\\1\\|',
      '~D|CAP#|0001\\1\\1\\|',
      '~D|0001|MO\\1\\1\\MAT\\1\\0\\%003\\1\\0\\|',
      '~M|CAP#\\0001|1\\1\\|2|',
    ].join('\r\n');
    const items = recalculateItems(importBc3(src).items);
    expect(items.filter((i) => i.rowType === 'regel').map((i) => `${i.code}:${i.quantity}:${i.total}`))
      .toEqual(['MO:2:20', 'MAT:0:0', '%003:0:0']);
    expect(getKostprijs(items)).toBeCloseTo(20, 2);
  });

  it('herstelt stuurtekens uit dubbel gecodeerde UTF-8', () => {
    // Arquímedes-export die als ISO-8859-1 is gelezen en als UTF-8 is
    // weggeschreven: 0x93/0x94 (“ ”) werden U+0093/U+0094.
    const src = Buffer.from('~V||FIEBDC-3/2004|ARQUIMEDES||ANSI|\r\n~C|A|ud|versión \u0093Directo\u0094|1||0|\r\n', 'utf-8');
    expect(decodeBc3(src.buffer.slice(src.byteOffset, src.byteOffset + src.byteLength) as ArrayBuffer)).toContain('versión “Directo”');
  });

  it('leest Windows-1252-specials (€, “ ”) onafhankelijk van de omgeving', () => {
    // Buiten de browser valt TextDecoder('windows-1252') terug op ISO-8859-1.
    const src = '~V||FIEBDC-3/2004|X||ANSI|\r\n~C|A|ud|12 \x80 \x93ok\x94|1||0|\r\n';
    expect(decodeBc3(bytes(src))).toContain('12 € “ok”');
  });

  it('haalt een regeleinde uit de korte omschrijving en houdt LF in de tekst', () => {
    const src = [
      '~V|Iturribizia, S.L.|FIEBDC-3/95|ppl 0.1|',
      '~C|A|ud|Señal cuadrada\r\ntornillos incluidos|1||0|',
      '~T|A|Primera línea.\r\nSegunda línea.|',
    ].join('\r\n');
    const item = importBc3(src).items.find((i) => i.code === 'A')!;
    expect(item.description).toBe('Señal cuadrada tornillos incluidos');
    expect(item.notes).toBe('Primera línea.\nSegunda línea.');
  });

  it('geeft een opslagregel de eenheid % zodat hij na export herkenbaar blijft', () => {
    const src = [
      '~V||FIEBDC-3/2004|X||ANSI|',
      '~C|PR##||Obra|10.3||0|',
      '~C|CAP#||Capítulo|10.3||0|',
      '~C|0001|m2|Partida|10.3||0|',
      '~C|MO|h|Peón|10||1|',
      '~C|IS13|%|Perfilería complementaria|29.45||0|',
      '~D|PR##|CAP#\\1\\1\\|',
      '~D|CAP#|0001\\1\\1\\|',
      '~D|0001|MO\\1\\1\\IS13\\1\\0.03\\|',
      '~M|CAP#\\0001|1\\1\\|1|',
    ].join('\r\n');
    const opslag = recalculateItems(importBc3(src).items).find((i) => i.code === 'IS13')!;
    expect(opslag.unit).toBe('%');
    expect(opslag.total).toBeCloseTo(0.3, 2);
  });

  it('importeert een bestand met een UTF-8 BOM', () => {
    const src = '﻿~V||FIEBDC-3/2016|X||UTF-8|||\r\n~C|A1|ud|Concepto ñ|5.00||0|\r\n';
    const res = importBc3File(new TextEncoder().encode(src).buffer as ArrayBuffer);
    expect(res.items.some((i) => i.description === 'Concepto ñ')).toBe(true);
  });
});
