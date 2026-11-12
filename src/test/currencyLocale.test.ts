import { afterEach, describe, expect, it } from 'vitest';
import { create } from 'zustand';
import { createHistorySlice, type HistorySlice } from '@/state/slices/historySlice';
import {
  currencySymbol, decimalSeparator, formatCurrency, formatMoney, formatMoneyKeepZero, formatNumber, formatNumberForEdit,
  parseLocaleNumber, parseNlNumber, safeCurrency, setNumberLocale,
} from '@/utils/formatting';
import { parseNumericInput } from '@/utils/numericInput';
import { CURRENCY_CODES, currencyOptions } from '@/utils/currencies';
import { synthesizeStaartItems, ensureBtwLaagItem, makeStaartItem } from '@/services/calculation/staartDefaults';

// Issue #65: valuta per begroting, getalnotatie volgens de app-taal.

const LANGS = 'ar bg bn ca cs da de el en es fa fi fr he hi hr hu id it ja ko lo ms nb nl pl pt ro ru sk sr sv sw ta th tr uk ur vi zh'.split(' ');

afterEach(() => setNumberLocale('nl-NL'));

describe('getalnotatie volgt de app-taal', () => {
  it('standaard (zonder taal) blijft het Nederlands', () => {
    expect(formatCurrency(1234.5)).toBe('1.234,50');
  });

  it('Engels: punt als decimaal, komma als duizendtal', () => {
    setNumberLocale('en');
    expect(formatNumber(1234.56)).toBe('1,234.56');
    expect(formatCurrency(-1500.5)).toBe('-1,500.50');
    expect(formatNumberForEdit(6.66)).toBe('6.66');
    expect(decimalSeparator()).toBe('.');
  });

  it('Arabisch toont Latijnse cijfers (leesbaar voor de cel-editor)', () => {
    setNumberLocale('ar');
    expect(formatNumber(1234.5)).toMatch(/1,234\.50/);
  });

  it('Fins/Zweeds minteken is een gewoon streepje (Excel-plakken)', () => {
    setNumberLocale('fi');
    expect(formatNumber(-12.5)).toBe('-12,50');
  });

  it('onbekende taalcode valt terug op Nederlands', () => {
    setNumberLocale('cimode-xx-!!');
    expect(formatNumber(1.5)).toBe('1,50');
  });
});

describe('invoer lezen in de taal van de app', () => {
  it('Engels', () => {
    expect(parseLocaleNumber('1,234.56', '.')).toBe(1234.56);
    expect(parseLocaleNumber('1,234', '.')).toBe(1234);
    expect(parseLocaleNumber('1,234,567', '.')).toBe(1234567);
    expect(parseLocaleNumber('12.5', '.')).toBe(12.5);
    expect(parseLocaleNumber('0,5', '.')).toBe(0.5);
    expect(parseLocaleNumber('-15.5', '.')).toBe(-15.5);
  });

  it('Nederlands blijft hetzelfde', () => {
    expect(parseNlNumber('1.234,56')).toBe(1234.56);
    expect(parseNlNumber('1.234')).toBe(1234);
    expect(parseNlNumber('60.5')).toBe(60.5);
    expect(parseNlNumber('-15,5')).toBe(-15.5);
  });

  it('beide tekens: het laatste is het decimaalteken', () => {
    expect(parseNlNumber('1,234.56')).toBe(1234.56);
    expect(parseLocaleNumber('1.234,56', '.')).toBe(1234.56);
  });

  it('spaties, harde spaties, apostrof en U+2212 als minteken', () => {
    expect(parseLocaleNumber('1 234,56', ',')).toBe(1234.56);
    expect(parseLocaleNumber('1 234,56', ',')).toBe(1234.56);
    expect(parseLocaleNumber("1'234.5", '.')).toBe(1234.5);
    expect(parseLocaleNumber('−12,5', ',')).toBe(-12.5);
  });

  it('cel-invoer (parseNumericInput) volgt de app-taal', () => {
    setNumberLocale('en');
    expect(parseNumericInput('1,234.56')).toBe(1234.56);
    expect(parseNumericInput('6.66')).toBe(6.66);
    expect(parseNumericInput('=1,234.5*2')).toBe(2469);
    setNumberLocale('nl');
    expect(parseNumericInput('1.234,56')).toBe(1234.56);
    expect(parseNumericInput('=1.234,5*2')).toBe(2469);
    expect(parseNumericInput('−12,5')).toBe(-12.5);
  });

  it.each(LANGS)('%s: wat je ziet en wat je bewerkt leest exact terug', (lang) => {
    setNumberLocale(lang);
    for (const v of [6.66, 1234.56, -1500.5, 1234567.89, 0.5, 42]) {
      expect(parseNumericInput(formatNumberForEdit(v))).toBe(v);
      expect(parseNumericInput(formatNumber(v))).toBe(v);
    }
  });
});

describe('bedrag met valutateken', () => {
  it('volgt valuta én taal, zonder omrekening', () => {
    setNumberLocale('en');
    expect(formatMoney(1234.5, 'USD')).toBe('$1,234.50');
    expect(formatMoney(1234.5, 'EUR')).toBe('€1,234.50');
    setNumberLocale('nl');
    expect(formatMoney(1234.5, 'EUR')).toBe('€ 1.234,50');
    setNumberLocale('es');
    expect(formatMoney(1234.5, 'MXN')).toMatch(/1234,50|1\.234,50/);
    expect(formatMoney(1234.5, 'MXN')).toContain('MXN');
  });

  it('0 en null blijven leeg, net als formatCurrency', () => {
    expect(formatMoney(0, 'USD')).toBe('');
    expect(formatMoney(null, 'USD')).toBe('');
  });

  it('ongeldige of ontbrekende valuta valt terug op EUR', () => {
    expect(safeCurrency('usd')).toBe('USD');
    expect(safeCurrency('')).toBe('EUR');
    expect(safeCurrency(undefined)).toBe('EUR');
    expect(safeCurrency('EURO')).toBe('EUR');
  });
});

describe('valutalijst', () => {
  it('alle codes zijn geldig voor Intl', () => {
    for (const code of CURRENCY_CODES) expect(safeCurrency(code)).toBe(code);
  });

  it('de colón van Costa Rica staat in de lijst (issue #81)', () => {
    expect(currencyOptions('EUR', 'es').map(o => o.code)).toContain('CRC');
    setNumberLocale('es-ES');
    // es-ES toont de code ("1234,50 CRC"), es-CR het teken (₡); nooit de euro.
    expect(formatMoney(1234.5, 'CRC')).toMatch(/CRC|₡/);
    expect(formatMoney(1234.5, 'CRC')).not.toContain('€');
  });

  it('een code uit een geïmporteerd bestand blijft kiesbaar', () => {
    const codes = currencyOptions('XOF', 'en').map(o => o.code);
    expect(codes).toContain('XOF');
    expect(codes).toContain('EUR');
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe('belastingnaam in de staart', () => {
  it('bijgemaakte btw-regels gebruiken de vertaalde tekst, geen hardcoded Nederlands', () => {
    const staart = synthesizeStaartItems({});
    const laag = staart.find(i => i.rowType === 'staart_btw_laag')!;
    const hoog = staart.find(i => i.rowType === 'staart_btw')!;
    // Zonder geïnitialiseerde i18n geeft uiText de Engelse standaardtekst.
    expect(laag.description).toBe('Low VAT:');
    expect(hoog.description).toBe('High VAT:');
    expect(laag.staartPercentage).toBe(9);
    expect(hoog.staartPercentage).toBe(21);
  });

  it('een oude staart krijgt een vertaalde lage-btw-regel', () => {
    const items = ensureBtwLaagItem([makeStaartItem('staart_btw', 'IVA general:', 16, 10)]);
    expect(items.find(i => i.rowType === 'staart_btw_laag')?.description).toBe('Low VAT:');
  });
});

describe('review-punten', () => {
  it('Engels: komma met 3 cijfers is ook in een formule een duizendtal', () => {
    setNumberLocale('en');
    expect(parseNumericInput('=1,234*2')).toBe(2468);
    expect(parseNumericInput('2*1,000')).toBe(2000);
    expect(parseNumericInput('=1,234,567')).toBe(1234567);
    expect(parseNumericInput('=12,5*2')).toBe(25);
    setNumberLocale('nl');
    expect(parseNumericInput('=1,234*2')).toBe(2.468);
  });

  it('valutateken los, voor kolomkoppen', () => {
    setNumberLocale('en');
    expect(currencySymbol('USD')).toBe('$');
    expect(currencySymbol('EUR')).toBe('€');
    expect(currencySymbol('CAD')).toBe('CA$');
    expect(currencySymbol('bogus')).toBe('€');
  });

  it('bedrag 0 blijft zichtbaar waar dat moet (kop, mobiel, wizard)', () => {
    setNumberLocale('en');
    expect(formatMoneyKeepZero(0, 'USD')).toBe('$0.00');
    expect(formatMoneyKeepZero(null, 'usd')).toBe('$0.00');
    expect(formatMoneyKeepZero(5, 'EURO')).toBe('€5.00');
  });

  it('valuta wisselen is ongedaan te maken en opnieuw te doen', () => {
    type S = HistorySlice & { items: []; schedule: { currency: string }; setSchedule: (p: { currency?: string }) => void };
    const store = create<S>()((set, get, api) => ({
      ...createHistorySlice(set as never, get as never, api as never),
      items: [],
      schedule: { currency: 'EUR' },
      setSchedule: (p) => set(s => ({ schedule: { ...s.schedule, ...p } })),
    }));
    const s = store.getState();
    s.pushHistory([], 'Currency', undefined, { currency: 'EUR' });
    s.setSchedule({ currency: 'USD' });
    store.getState().undo();
    expect(store.getState().schedule.currency).toBe('EUR');
    store.getState().redo();
    expect(store.getState().schedule.currency).toBe('USD');
    // Een gewone stap laat de valuta met rust.
    store.getState().pushHistory([], 'Edit');
    store.getState().undo();
    expect(store.getState().schedule.currency).toBe('USD');
  });
});

describe('structuurboom volgt de app-taal', () => {
  it('bedragen zonder centen, onder 1 met centen, en percentages', async () => {
    const { formatTreeAmount, formatTreePercent } = await import('@/components/panels/structureTree/treeModel');
    expect(formatTreeAmount(1234.56)).toBe('1.235');
    expect(formatTreeAmount(0.5)).toBe('0,50');
    expect(formatTreeAmount(0)).toBe('');
    expect(formatTreePercent(12.345)).toBe('12,3');
    expect(formatTreePercent(0)).toBe('0,0');
    setNumberLocale('en');
    expect(formatTreeAmount(1234.56)).toBe('1,235');
    expect(formatTreeAmount(0.5)).toBe('0.50');
    expect(formatTreePercent(12.345)).toBe('12.3');
    expect(formatTreePercent(0)).toBe('0.0');
  });
});
