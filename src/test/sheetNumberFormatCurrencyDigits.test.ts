import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { useAppStore } from '@/state/appStore';
import type { SubSheetCell } from '@/types/costModel';
import { cellDecimals, cellDisplayText, formatCellNumber } from '@/services/spreadsheet/cellDisplay';
import { currencyDigits, formatCurrency, setNumberFormatPreference } from '@/utils/formatting';
import { buildBudgetContext, parseLocalBudgetCommand } from '@/services/assistant/assistantActions';
import { begrotenKennis, BEGROTEN_KENNIS } from '@/services/assistant/begrotenKennis';

// Review-restpunten van #74 (issue #65): subbladen volgen de instelling
// "Getalnotatie", valuta zonder centen tonen geen decimalen en de assistent
// noemt de begrotingsvaluta in plaats van een vaste euro.

const s = () => useAppStore.getState();
const computed = (id: string, ref: string) => s().getSubSheet(id)!.cells[ref].computed;

afterEach(() => setNumberFormatPreference('nl-NL'));

describe('subbladen volgen de getalnotatie', () => {
  it('toont getallen in de gekozen notatie', () => {
    setNumberFormatPreference('en-US');
    expect(formatCellNumber(1250, 2)).toBe('1,250.00');
    expect(cellDisplayText({ value: '=A1', computed: 0.125, format: 'percentage', decimals: 1 })).toBe('12.5%');
    setNumberFormatPreference('nl-NL');
    expect(formatCellNumber(1250, 2)).toBe('1.250,00');
    expect(cellDisplayText({ value: '=A1', computed: 0.125, format: 'percentage', decimals: 1 })).toBe('12,5%');
  });

  it('leest getypte getallen in de gekozen notatie en accepteert beide decimaaltekens', () => {
    setNumberFormatPreference('en-US');
    const en = s().addSubSheet('en-notatie');
    s().setSubSheetCell(en, 'A1', '1,250');
    s().setSubSheetCell(en, 'A2', '6.66');
    s().setSubSheetCell(en, 'A3', '6,66');
    s().setSubSheetCell(en, 'A4', '1.234,56');
    expect([computed(en, 'A1'), computed(en, 'A2'), computed(en, 'A3'), computed(en, 'A4')]).toEqual([1250, 6.66, 6.66, 1234.56]);

    setNumberFormatPreference('nl-NL');
    const nl = s().addSubSheet('nl-notatie');
    s().setSubSheetCell(nl, 'A1', '1.250');
    s().setSubSheetCell(nl, 'A2', '6,66');
    s().setSubSheetCell(nl, 'A3', '1,234.56');
    expect([computed(nl, 'A1'), computed(nl, 'A2'), computed(nl, 'A3')]).toEqual([1250, 6.66, 1234.56]);
  });

  it('een cel die ongewijzigd wordt bevestigd houdt zijn waarde na een notatiewissel', () => {
    setNumberFormatPreference('en-US');
    const id = s().addSubSheet('wissel');
    s().setSubSheetCell(id, 'A1', '1,250');
    s().setSubSheetCell(id, 'A2', '=A1*2');
    setNumberFormatPreference('nl-NL');
    s().setSubSheetCell(id, 'A1', '1,250');
    expect(computed(id, 'A1')).toBe(1250);
    expect(computed(id, 'A2')).toBe(2500);
    // Nieuwe invoer volgt wel de nieuwe notatie.
    s().setSubSheetCell(id, 'A1', '1,5');
    expect(computed(id, 'A1')).toBe(1.5);
  });

  it('formules rekenen los van de notatie, zodat opgeslagen formules niet van betekenis veranderen', () => {
    for (const pref of ['nl-NL', 'en-US']) {
      setNumberFormatPreference(pref);
      const id = s().addSubSheet(`formule-${pref}`);
      s().setSubSheetCell(id, 'A1', '10');
      s().setSubSheetCell(id, 'A2', '=A1*2,5');
      s().setSubSheetCell(id, 'A3', '=A1*2.5');
      s().setSubSheetCell(id, 'A4', '=SUM(A1:A3)');
      expect([computed(id, 'A2'), computed(id, 'A3'), computed(id, 'A4')]).toEqual([25, 25, 60]);
    }
  });
});

describe('valuta zonder centen', () => {
  it('kent het aantal decimalen per valuta', () => {
    expect(['EUR', 'USD', 'JPY', 'KRW', 'CLP', 'KWD'].map(currencyDigits)).toEqual([2, 2, 0, 0, 0, 3]);
    expect(currencyDigits('XXX-ongeldig')).toBe(2);
  });

  it('rasterbedragen gebruiken de decimalen van de valuta; zonder valuta blijft het 2', () => {
    expect(formatCurrency(1234.5, 'JPY')).toBe('1.235');
    expect(formatCurrency(1234.5, 'EUR')).toBe('1.234,50');
    expect(formatCurrency(1234.5, 'KWD')).toBe('1.234,500');
    expect(formatCurrency(1234.5)).toBe('1.234,50');
  });

  it('valutacellen in subbladen volgen de valuta, tenzij de cel eigen decimalen heeft', () => {
    const money: SubSheetCell = { value: '1234,5', computed: 1234.5, format: 'currency' };
    expect(cellDisplayText(money, 'JPY')).not.toMatch(/,\d/);
    expect(cellDisplayText(money, 'JPY')).toContain('1.235');
    expect(cellDisplayText(money, 'EUR')).toContain('1.234,50');
    expect(cellDisplayText({ ...money, decimals: 2 }, 'JPY')).toContain('1.234,50');
    expect(cellDecimals(money, 'JPY')).toBe(0);
    expect(cellDecimals({ value: '1', computed: 1 }, 'JPY')).toBe(2);
    // Opgeslagen waarde blijft ongewijzigd.
    expect(money.computed).toBe(1234.5);
  });
});

describe('assistent gebruikt de begrotingsvaluta', () => {
  it('lokaal commando leest de prijs met elk valutateken of elke code', () => {
    for (const price of ['€145', '€ 145', '$145', 'US$ 145', 'CHF 145', '145 kr', '145 €', '¥145']) {
      expect(parseLocalBudgetCommand(`Add under 21.01 a line: 12 m³ Concrete C30 at ${price}`)).toMatchObject([{ onderNr: '21.01', aantal: 12, prijs: 145 }]);
    }
    expect(parseLocalBudgetCommand('Voeg onder 21.01 een regel toe: 12,5 m3 Beton C30 à € 145,50')).toMatchObject([{ aantal: 12.5, prijs: 145.5 }]);
    expect(parseLocalBudgetCommand('Add under 21.01 a line: 12 m³ Concrete C30 at -145')).toBeNull();
  });

  it('vakkennis en begrotingscontext noemen de valuta van de begroting', () => {
    const kennis = begrotenKennis('USD');
    expect(kennis).toContain('USD/m² BVO');
    expect(kennis).not.toContain('€');
    expect(kennis).toContain('Rekenregel'); // Nederlandse vakkennis blijft staan
    expect(BEGROTEN_KENNIS).toContain('EUR/m² BVO');
    const ctx = buildBudgetContext({ ...s().schedule, currency: 'JPY' }, []);
    expect(ctx).toContain('Valuta: JPY');
  });

  it('het voorbeeld in de chat heeft in elke taal een prijs-plek in plaats van een vaste euro', () => {
    const dir = join(process.cwd(), 'src/i18n/locales');
    for (const lang of readdirSync(dir)) {
      const common = JSON.parse(readFileSync(join(dir, lang, 'common.json'), 'utf8'));
      const example: string = common.workspace.chat.example;
      expect(example, lang).toContain('{{price}}');
      expect(example, lang).not.toContain('€');
    }
  });
});
