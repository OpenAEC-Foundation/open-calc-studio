import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as XLSX from 'xlsx';
import { parseCsv, parseXlsxTabular, autoDetectMapping, buildFromMapping } from '@/services/importers';
import { cellIssueKind } from '@/services/importers/genericTabularImporter';
import { recalculateItems } from '@/services/calculation/calculator';

// Issue #88: een Excel-cel met een formule zonder opgeslagen uitkomst, of met
// een Excel-fout, kwam stil als leeg binnen (post van 0). Nu volgt een melding
// met blad, cel en kolom. Formules mét uitkomst blijven gewoon werken.

type Cells = Record<string, XLSX.CellObject>;

function xlsx(cells: Cells, ref: string, sheet = 'Blad1'): Uint8Array {
  const ws = { '!ref': ref, ...cells } as XLSX.WorkSheet;
  const wb = { SheetNames: [sheet], Sheets: { [sheet]: ws } } as XLSX.WorkBook;
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
}

const header: Cells = {
  A1: { t: 's', v: 'Omschrijving' }, B1: { t: 's', v: 'Hoeveelheid' }, C1: { t: 's', v: 'Prijs' },
};

function importRows(cells: Cells, ref: string) {
  const data = parseXlsxTabular(xlsx(cells, ref), 'test');
  const result = buildFromMapping(data, autoDetectMapping(data.headers));
  return { data, result, items: recalculateItems(result.items) };
}

const formulaWarning = (warnings: string[]) => warnings.filter((w) => /usable value|bruikbare waarde/.test(w));

describe('#88 Excel-import: formules zonder uitkomst en foutcellen', () => {
  it('gewone getallen: juiste waarde en geen melding', () => {
    const { result, items } = importRows({ ...header, A2: { t: 's', v: 'Post' }, B2: { t: 'n', v: 20 }, C2: { t: 'n', v: 30 } }, 'A1:C2');
    expect(items.find((i) => i.description === 'Post')!.total).toBeCloseTo(600);
    expect(formulaWarning(result.warnings)).toEqual([]);
  });

  it('formule met opgeslagen uitkomst: die uitkomst telt, geen melding', () => {
    const { result, items } = importRows({ ...header, A2: { t: 's', v: 'Post' }, B2: { t: 'n', v: 20, f: '2*10' }, C2: { t: 'n', v: 30 } }, 'A1:C2');
    expect(items.find((i) => i.description === 'Post')!.quantity).toBe(20);
    expect(formulaWarning(result.warnings)).toEqual([]);
  });

  it('formule zonder opgeslagen uitkomst: melding met blad, cel en kolom', () => {
    const { result } = importRows({ ...header, A2: { t: 's', v: 'Post' }, B2: { t: 'n', f: '2*10' } as XLSX.CellObject, C2: { t: 'n', v: 30 } }, 'A1:C2');
    const [warning] = formulaWarning(result.warnings);
    expect(warning).toBeDefined();
    expect(warning).toContain('Blad1!B2 (Hoeveelheid)');
  });

  it('Excel-foutcel: melding met de fouttekst', () => {
    const { result } = importRows({ ...header, A2: { t: 's', v: 'Post' }, B2: { t: 'n', v: 20 }, C2: { t: 'e', v: 0x17, w: '#REF!', f: 'Z99*#REF!' } }, 'A1:C2');
    expect(formulaWarning(result.warnings)[0]).toContain('Blad1!C2 #REF! (Prijs)');
  });

  it('geen melding voor een kolom die niet als getal gekoppeld is', () => {
    const data = parseXlsxTabular(xlsx({ ...header, A2: { t: 's', v: 'Post' }, B2: { t: 'n', v: 20 }, C2: { t: 'n', f: '1+1' } as XLSX.CellObject }, 'A1:C2'), 'test');
    expect(data.cellIssues).toHaveLength(1);
    const result = buildFromMapping(data, ['description', 'quantity', 'ignore']);
    expect(formulaWarning(result.warnings)).toEqual([]);
  });

  it('geen melding voor een rij die niet geïmporteerd wordt (geen omschrijving of code)', () => {
    // C2 houdt de rij in de data; zonder omschrijving slaat buildFromMapping hem over.
    const cells: Cells = { ...header, D1: { t: 's', v: 'Notitie' }, B2: { t: 'n', f: '1+1' } as XLSX.CellObject, D2: { t: 's', v: 'los' }, A3: { t: 's', v: 'Post' }, B3: { t: 'n', v: 1 } };
    const data = parseXlsxTabular(xlsx(cells, 'A1:D3'), 'test');
    expect(data.rows).toHaveLength(2);
    expect(data.cellIssues).toHaveLength(1);
    const result = buildFromMapping(data, ['description', 'quantity', 'unitPrice', 'ignore']);
    expect(formulaWarning(result.warnings)).toEqual([]);
  });

  // Echte bestanden schrijven <f>…</f><v/>; SheetJS laat zo'n cel zonder
  // sheetStubs helemaal weg. Dit bestand is gemaakt met openpyxl 3.1.5 en nooit
  // in Excel geopend (Wapening!C3 = C2*4 en Notitie B4 = 1+1, zonder uitkomst).
  it('meldt een formule zonder uitkomst in een echt bestand (openpyxl)', () => {
    const bytes = readFileSync(resolve(__dirname, 'fixtures/imports/issue88-openpyxl-formula-without-result.xlsx'));
    const data = parseXlsxTabular(new Uint8Array(bytes), 'openpyxl');
    expect(data.headers).toEqual(['Omschrijving', 'Notitie', 'Hoeveelheid', 'Prijs']);
    expect(data.rows.map((r) => r[0])).toEqual(['Metselwerk', 'Wapening', 'Alleen notitie']);
    const result = buildFromMapping(data, autoDetectMapping(data.headers));
    const warnings = formulaWarning(result.warnings);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('(1)');
    expect(warnings[0]).toContain('Begroting!C3 (Hoeveelheid)');
    // B4 staat in een kolom die niet als getal is gekoppeld.
    expect(warnings[0]).not.toContain('B4');
  });

  it('bewaart per kolom maximaal 200 cellen maar telt ze allemaal', () => {
    const cells: Cells = { ...header };
    const last = 260;
    for (let r = 2; r <= last; r++) {
      cells[`A${r}`] = { t: 's', v: `Post ${r}` };
      cells[`B${r}`] = { t: 'e', v: 0x17, w: '#REF!' };
      cells[`C${r}`] = { t: 'n', v: 1 };
    }
    const data = parseXlsxTabular(xlsx(cells, `A1:C${last}`), 'test');
    expect(data.cellIssues).toHaveLength(200);
    expect(data.cellIssuesOverflow?.[1]).toHaveLength(last - 1 - 200);
    const [warning] = formulaWarning(buildFromMapping(data, autoDetectMapping(data.headers)).warnings);
    expect(warning).toContain(`(${last - 1})`);
  });

  it('klopt het adres ook met lege rijen en een tabel die niet in A1 begint', () => {
    const cells: Cells = {
      B3: { t: 's', v: 'Omschrijving' }, C3: { t: 's', v: 'Hoeveelheid' }, D3: { t: 's', v: 'Prijs' },
      B4: { t: 's', v: 'Eerste' }, C4: { t: 'n', v: 1 }, D4: { t: 'n', v: 10 },
      // rij 5 is leeg
      B6: { t: 's', v: 'Tweede' }, C6: { t: 'n', f: 'C4*2' } as XLSX.CellObject, D6: { t: 'n', v: 10 },
    };
    const { data, result } = importRows(cells, 'B3:D6');
    expect(data.rows.map((r) => r[0])).toEqual(['Eerste', 'Tweede']);
    expect(formulaWarning(result.warnings)[0]).toContain('Blad1!C6 (Hoeveelheid)');
  });

  it('noemt maximaal vijf cellen en telt de rest wel mee', () => {
    const cells: Cells = { ...header };
    for (let r = 2; r <= 8; r++) {
      cells[`A${r}`] = { t: 's', v: `Post ${r}` };
      cells[`B${r}`] = { t: 'n', f: '1+1' } as XLSX.CellObject;
      cells[`C${r}`] = { t: 'n', v: 5 };
    }
    const [warning] = formulaWarning(importRows(cells, 'A1:C8').result.warnings);
    expect(warning).toContain('(7)');
    expect(warning).toContain('Blad1!B6');
    expect(warning).not.toContain('Blad1!B7');
    expect(warning).toContain('…');
  });

  it('CSV heeft geen formules en dus geen meldingen', () => {
    const data = parseCsv('Omschrijving;Hoeveelheid;Prijs\nPost;2;3', 'csv');
    expect(data.cellIssues).toBeUndefined();
    expect(formulaWarning(buildFromMapping(data, autoDetectMapping(data.headers)).warnings)).toEqual([]);
  });

  it('een regel waarvan alle getalcellen kapot zijn blijft een post, geen hoofdstuk', () => {
    const { items } = importRows({
      ...header,
      A2: { t: 's', v: 'Kapot' }, B2: { t: 'n', f: '1+1' } as XLSX.CellObject, C2: { t: 'e', v: 0x17, w: '#REF!' },
      A3: { t: 's', v: 'Daarna' }, B3: { t: 'n', v: 2 }, C3: { t: 'n', v: 5 },
    }, 'A1:C3');
    const kapot = items.find((i) => i.description === 'Kapot')!;
    expect(kapot.rowType).toBe('begrotingspost');
    // De volgende post hangt er niet onder.
    expect(items.find((i) => i.description === 'Daarna')!.parentId).not.toBe(kapot.id);
  });

  // XlsxWriter/pandas schrijven bij elke formule een nep-uitkomst 0 en zetten
  // fullCalcOnLoad: nooit in Excel berekend. B3 = B2*4 en C4 = C2*3 hebben 0.
  it('meldt formules in een bestand dat nooit in Excel is berekend (nep-uitkomst 0)', () => {
    const bytes = readFileSync(resolve(__dirname, 'fixtures/imports/issue88-uncalculated-placeholder-zero.xlsx'));
    const data = parseXlsxTabular(new Uint8Array(bytes), 'xlsxwriter');
    const [warning] = formulaWarning(buildFromMapping(data, autoDetectMapping(data.headers)).warnings);
    expect(warning).toContain('(2)');
    expect(warning).toContain('Begroting!B3 (Hoeveelheid)');
    expect(warning).toContain('Begroting!C4 (Prijs)');
  });

  it('telt boven het maximum alleen cellen van regels die geïmporteerd worden', () => {
    const cells: Cells = { ...header, D1: { t: 's', v: 'Notitie' } };
    for (let r = 2; r <= 251; r++) {
      // De eerste 230 regels hebben geen omschrijving en worden overgeslagen.
      if (r > 231) cells[`A${r}`] = { t: 's', v: `Post ${r}` };
      else cells[`D${r}`] = { t: 's', v: 'hulpregel' };
      cells[`B${r}`] = { t: 'e', v: 0x17, w: '#REF!' };
    }
    const data = parseXlsxTabular(xlsx(cells, 'A1:D251'), 'test');
    const [warning] = formulaWarning(buildFromMapping(data, autoDetectMapping(data.headers)).warnings);
    expect(warning).toContain('(20)');
    expect(warning).toContain('…');
  });

  it('zet een bladnaam met spaties tussen quotes, zoals Excel', () => {
    const data = parseXlsxTabular(xlsx({ ...header, A2: { t: 's', v: 'Post' }, B2: { t: 'e', v: 0x07, w: '#DIV/0!' } }, 'A1:C2', 'Begroting 2024'), 'test');
    expect(data.cellIssues?.[0].address).toBe("'Begroting 2024'!B2");
  });
});

describe('#88 cellIssueKind', () => {
  const kind = (cell: Record<string, unknown>, uncalculated = false) => cellIssueKind(cell as unknown as XLSX.CellObject, uncalculated);

  it('herkent foutcellen, ook nieuwere die SheetJS niet als code kent', () => {
    expect(kind({ t: 'e', v: 0x17, w: '#REF!' })).toEqual({ kind: 'error', text: '#REF!' });
    expect(kind({ t: 'e', v: 0x00, w: '#NULL!' })).toEqual({ kind: 'error', text: '#NULL!' });
    expect(kind({ t: 'e', f: '_xlfn.SEQUENCE(3)', w: '#SPILL!' })).toEqual({ kind: 'error', text: '#SPILL!' });
  });

  it('herkent formules zonder uitkomst', () => {
    expect(kind({ t: 'e', f: '2*10' })).toEqual({ kind: 'noCachedValue' });
    expect(kind({ t: 'z', f: '2*10', v: 0 })).toEqual({ kind: 'noCachedValue' });
    expect(kind({ t: 'z', F: 'B16:B17', v: 0 })).toEqual({ kind: 'noCachedValue' });
    expect(kind({ t: 'n', f: '2*10', v: 0 }, true)).toEqual({ kind: 'noCachedValue' });
  });

  it('laat gewone waarden en formules met een uitkomst met rust', () => {
    expect(kind({ t: 'n', v: 0 })).toBeNull();
    expect(kind({ t: 'n', f: '2*10', v: 20 })).toBeNull();
    expect(kind({ t: 's', f: 'IF(A1="","",A1)', v: '' })).toBeNull();
    expect(kind({ t: 'z' })).toBeNull();
    expect(kind({ t: 'n', v: 5 }, true)).toBeNull();
  });
});
