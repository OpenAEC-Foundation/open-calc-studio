import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as XLSX from 'xlsx';
import i18next from '@/i18n/config';
import ColumnMappingDialog from '@/components/backstage/ColumnMappingDialog';
import { askColumnMapping } from '@/components/backstage/askColumnMapping';
import {
  autoDetectMapping,
  buildFromMapping,
  parseCsv,
  parseXlsxTabular,
  summarizeCells,
  type ColumnMapping,
  type TabularData,
} from '@/services/importers';

// #88, vervolg: de gebruiker ziet vóór het importeren welke getallen
// opgeslagen Excel-uitkomsten zijn en welke cellen geen waarde hebben, en
// aanroepers zonder UI krijgen hetzelfde gestructureerd.

type Cells = Record<string, XLSX.CellObject>;

function xlsx(cells: Cells, ref: string): Uint8Array {
  const ws = { '!ref': ref, ...cells } as XLSX.WorkSheet;
  const wb = { SheetNames: ['Blad1'], Sheets: { Blad1: ws } } as XLSX.WorkBook;
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
}

const header: Cells = {
  A1: { t: 's', v: 'Omschrijving' }, B1: { t: 's', v: 'Hoeveelheid' }, C1: { t: 's', v: 'Prijs' },
};

// Rij 2: hoeveelheid uit een formule met uitkomst. Rij 3: prijs is #REF!.
// Rij 4: een formule-uitkomst op een regel zonder omschrijving (niet geïmporteerd).
const mixed: Cells = {
  ...header,
  A2: { t: 's', v: 'Beton' }, B2: { t: 'n', v: 20, f: '2*10' }, C2: { t: 'n', v: 30 },
  A3: { t: 's', v: 'Staal' }, B3: { t: 'n', v: 5 }, C3: { t: 'e', v: 0x17, w: '#REF!', f: 'Z9*#REF!' },
  B4: { t: 'n', v: 7, f: '3+4' },
};

const parsedMixed = () => parseXlsxTabular(xlsx(mixed, 'A1:C4'), 'test');
const formulaNotice = (warnings: string[]) => warnings.filter((w) => w.startsWith('Values from Excel formulas'));

describe('#88 formule-uitkomsten in de import', () => {
  beforeEach(async () => { await i18next.changeLanguage('en'); });

  it('onthoudt welke cellen een formule mét uitkomst zijn, los van cellen zonder waarde', () => {
    const data = parsedMixed();
    expect(data.formulaCells).toEqual({ 1: [0, 2] });
    expect(data.cellIssues).toEqual([expect.objectContaining({ row: 1, col: 2, kind: 'error', text: '#REF!' })]);
  });

  it('telt alleen getalkolommen en regels die geïmporteerd worden, en volgt de koppeling', () => {
    const data = parsedMixed();
    const mapping = autoDetectMapping(data.headers);
    expect(summarizeCells(data, mapping)).toEqual({ formulaValues: 1, unusableCells: 1 });
    // Hoeveelheid niet koppelen: de formule telt niet meer mee.
    expect(summarizeCells(data, ['description', 'ignore', 'unitPrice'])).toEqual({ formulaValues: 0, unusableCells: 1 });
    // Hoeveelheid als omschrijving: geen getalkolom, dus geen formule-uitkomst.
    expect(summarizeCells(data, ['ignore', 'description', 'ignore'])).toEqual({ formulaValues: 0, unusableCells: 0 });
  });

  it('telt een formule die leeg of tekst oplevert niet als getal', () => {
    const data = parseXlsxTabular(xlsx({
      ...header,
      A2: { t: 's', v: 'Hoofdstuk' }, B2: { t: 's', v: '', f: 'IF(1,"",1)' }, C2: { t: 's', v: 'n.v.t.', f: 'IF(1,"n.v.t.",1)' },
      A3: { t: 's', v: 'Beton' }, B3: { t: 'n', v: 2, f: '1+1' }, C3: { t: 'n', v: 30 },
    }, 'A1:C3'), 'test');
    expect(summarizeCells(data, autoDetectMapping(data.headers)).formulaValues).toBe(1);
  });

  it('telt een Totaal-formule niet als de import de eenheidsprijs gebruikt', () => {
    // Hoeveelheid × eenheidsprijs met een Totaal =B2*C2 (opgeslagen uitkomst
    // verouderd: 999). De post wordt 20; de formule komt nergens in de begroting.
    const cells: Cells = {
      A1: { t: 's', v: 'Omschrijving' }, B1: { t: 's', v: 'Hoeveelheid' }, C1: { t: 's', v: 'Eenheidsprijs' }, D1: { t: 's', v: 'Totaal' },
      A2: { t: 's', v: 'Beton' }, B2: { t: 'n', v: 2 }, C2: { t: 'n', v: 10 }, D2: { t: 'n', v: 999, f: 'B2*C2' },
      A3: { t: 's', v: 'Staal' }, B3: { t: 'n', v: 1 }, C3: { t: 'n', v: 5 }, D3: { t: 'e', v: 0x17, w: '#REF!', f: 'B3*#REF!' },
      A4: { t: 's', v: 'Post' }, D4: { t: 'n', v: 40, f: '4*10' },
    };
    const data = parseXlsxTabular(xlsx(cells, 'A1:D4'), 'test');
    const mapping = autoDetectMapping(data.headers);
    expect(mapping).toEqual(['description', 'quantity', 'unitPrice', 'total']);
    // Alleen D4 telt: die regel heeft geen eenheidsprijs, dus het totaal wordt gebruikt.
    expect(summarizeCells(data, mapping)).toEqual({ formulaValues: 1, unusableCells: 0 });
    const result = buildFromMapping(data, mapping);
    expect(result.cellDiagnostics?.cells).toEqual([]);
    expect(result.warnings.filter((w) => /usable value/.test(w))).toEqual([]);
  });

  it('telt bij een dubbel gekoppeld veld alleen de kolom die de import gebruikt', () => {
    const data = parsedMixed();
    // Kolom C ook als hoeveelheid: de import gebruikt alleen kolom B.
    expect(summarizeCells(data, ['description', 'quantity', 'quantity'])).toEqual({ formulaValues: 1, unusableCells: 0 });
  });

  it('telt cellen boven het maximum per kolom mee, alleen op geïmporteerde regels', () => {
    const data: TabularData = {
      headers: ['Omschrijving', 'Hoeveelheid'],
      rows: [['A', ''], ['', ''], ['B', '']],
      sourceName: 'test',
      cellIssuesOverflow: { 1: [0, 1, 2] },
    };
    expect(summarizeCells(data, ['description', 'quantity'])).toEqual({ formulaValues: 0, unusableCells: 2 });
  });

  it('levert dezelfde informatie gestructureerd aan aanroepers zonder UI', () => {
    const data = parsedMixed();
    const result = buildFromMapping(data, autoDetectMapping(data.headers));
    expect(result.cellDiagnostics).toEqual({
      formulaValues: 1,
      unusableCells: 1,
      cells: [{ address: 'Blad1!C3', field: 'unitPrice', column: 'Prijs', kind: 'error', text: '#REF!' }],
    });
  });

  it('meldt zonder dialoog dat de getallen opgeslagen uitkomsten zijn, na de dialoog niet nog eens', () => {
    const data = parsedMixed();
    const mapping = autoDetectMapping(data.headers);
    expect(formulaNotice(buildFromMapping(data, mapping).warnings)).toEqual([
      'Values from Excel formulas: 1. These are the results last saved in Excel; they were imported as they are and not recalculated.',
    ]);
    const reviewed = buildFromMapping(data, mapping, { formulaValuesReviewed: true });
    expect(formulaNotice(reviewed.warnings)).toEqual([]);
    expect(reviewed.cellDiagnostics?.formulaValues).toBe(1);
  });

  it('gewone getallen en CSV: geen diagnostiek en geen melding', () => {
    const literal = parseXlsxTabular(xlsx({ ...header, A2: { t: 's', v: 'Beton' }, B2: { t: 'n', v: 20 }, C2: { t: 'n', v: 30 } }, 'A1:C2'), 'test');
    const fromLiteral = buildFromMapping(literal, autoDetectMapping(literal.headers));
    expect(fromLiteral.cellDiagnostics).toBeUndefined();
    expect(fromLiteral.warnings).toEqual([]);
    const csv = parseCsv('Omschrijving;Hoeveelheid;Prijs\nBeton;20;30', 'test.csv');
    expect(buildFromMapping(csv, autoDetectMapping(csv.headers)).cellDiagnostics).toBeUndefined();
  });

  it('een bestand dat nooit in Excel is berekend: geen formule-uitkomsten, alleen cellen zonder waarde', () => {
    const bytes = new Uint8Array(readFileSync(resolve(__dirname, 'fixtures/imports/issue88-uncalculated-placeholder-zero.xlsx')));
    const data = parseXlsxTabular(bytes, 'xlsxwriter');
    const summary = summarizeCells(data, autoDetectMapping(data.headers));
    expect(summary.formulaValues).toBe(0);
    expect(summary.unusableCells).toBeGreaterThan(0);
  });
});

describe('#88 kolomdialoog: zien vóór het importeren, dan importeren of annuleren', () => {
  let root: Root;
  let node: HTMLDivElement;
  const mount = async (component: React.ReactNode) => { await act(async () => root.render(component)); };
  const notice = () => document.querySelector('.cmd-notice');
  const buttons = () => document.querySelectorAll<HTMLButtonElement>('.cmd-actions button');

  beforeEach(async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18next.changeLanguage('en');
    node = document.createElement('div');
    document.body.append(node);
    root = createRoot(node);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    node.remove();
    document.body.innerHTML = '';
  });

  it('toont het aantal formule-uitkomsten en cellen zonder waarde, en past dat aan bij een andere koppeling', async () => {
    await mount(<ColumnMappingDialog open data={parsedMixed()} onConfirm={vi.fn()} onClose={vi.fn()} />);
    expect(document.querySelector('.cmd-notice-formulas')!.textContent).toBe(
      'Values from Excel formulas in the linked number columns: 1. These are the results last saved in Excel; they are imported as they are and not recalculated.',
    );
    expect(document.querySelector('.cmd-notice-unusable')!.textContent).toContain('Cells without a usable value in the linked number columns: 1');
    // Prijs niet koppelen: de foutcel telt niet meer.
    const price = document.querySelectorAll('select')[2];
    await act(async () => { price.value = 'ignore'; price.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(document.querySelector('.cmd-notice-unusable')).toBeNull();
    expect(document.querySelector('.cmd-notice-formulas')).not.toBeNull();
  });

  it('een bestand zonder formules geeft geen melding', async () => {
    const data: TabularData = { headers: ['Description', 'Quantity'], rows: [['Concrete', '2']], sourceName: 'plain.csv' };
    await mount(<ColumnMappingDialog open data={data} onConfirm={vi.fn()} onClose={vi.fn()} />);
    expect(notice()).toBeNull();
  });

  it('Importeren geeft de koppeling door, Annuleren niets', async () => {
    const confirm = vi.fn<(mapping: ColumnMapping) => void>();
    const close = vi.fn();
    await mount(<ColumnMappingDialog open data={parsedMixed()} onConfirm={confirm} onClose={close} />);
    expect(notice()).not.toBeNull();
    await act(async () => buttons()[0].click());
    expect(close).toHaveBeenCalledOnce();
    expect(confirm).not.toHaveBeenCalled();
    await act(async () => buttons()[1].click());
    expect(confirm).toHaveBeenCalledWith(['description', 'quantity', 'unitPrice']);
  });

  it('via askColumnMapping: annuleren levert null op, bevestigen de koppeling', async () => {
    let pending!: Promise<ColumnMapping | null>;
    await act(async () => { pending = askColumnMapping(parsedMixed()); });
    expect(notice()).not.toBeNull();
    await act(async () => buttons()[0].click());
    expect(await pending).toBeNull();

    await act(async () => { pending = askColumnMapping(parsedMixed()); });
    await act(async () => buttons()[1].click());
    expect(await pending).toEqual(['description', 'quantity', 'unitPrice']);
  });
});
