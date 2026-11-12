import { afterEach, describe, expect, it } from 'vitest';
import { create } from 'zustand';
import { createHistorySlice, type HistorySlice } from '@/state/slices/historySlice';
import {
  currencySymbol, decimalSeparator, formatCurrency, formatMoney, formatMoneyKeepZero, formatNumber, formatNumberForEdit,
  parseLocaleNumber, parseNlNumber, safeCurrency, setNumberLocale,
} from '@/utils/formatting';
import { parseNumericInput } from '@/utils/numericInput';
import { allCurrencyCodes, CURRENCY_CODES, currencyOptions, filterCurrencyOptions, MAIN_CURRENCY_CODES, mainCurrencyOptions } from '@/utils/currencies';
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

describe('volledige valutalijst met zoeken (issue #81)', () => {
  it('bevat alle ISO-valuta die de runtime kent, zonder edelmetalen, testcodes en fondsen', () => {
    const codes = allCurrencyCodes();
    expect(codes.length).toBeGreaterThan(CURRENCY_CODES.length + 50);
    for (const code of ['CRC', 'KWD', 'ISK', 'XOF', ...CURRENCY_CODES.filter(c => c !== 'BGN')]) expect(codes).toContain(code);
    for (const code of ['XAU', 'XAG', 'XPT', 'XPD', 'XTS', 'XXX', 'XDR', 'XSU', 'XUA', 'CLF', 'USN', 'CHE']) expect(codes).not.toContain(code);
    for (const code of codes) expect(safeCurrency(code)).toBe(code);
  });

  it('valuta die niet meer bestaan staan niet in de lijst, maar een bestaande begroting houdt ze', () => {
    const codes = allCurrencyCodes();
    for (const code of ['ANG', 'BGN', 'CUC', 'HRK', 'SLL', 'SVC', 'ZWL']) expect(codes).not.toContain(code);
    const options = currencyOptions('HRK', 'nl');
    expect(options.filter(o => o.code === 'HRK')).toHaveLength(1);
    // De importers herkennen BGN nog wel, voor oude bestanden.
    expect(CURRENCY_CODES).toContain('BGN');
  });

  it('zonder Intl.supportedValuesOf valt de lijst terug op de korte lijst', () => {
    const intl = Intl as unknown as { supportedValuesOf?: unknown };
    const original = intl.supportedValuesOf;
    intl.supportedValuesOf = undefined;
    try {
      // BGN staat nog in CURRENCY_CODES (importers), maar niet meer in de keuzelijst.
      expect(allCurrencyCodes()).toEqual(CURRENCY_CODES.filter(code => code !== 'BGN').sort());
    } finally {
      intl.supportedValuesOf = original;
    }
  });

  it('de importers houden de korte lijst (ALL, TOP, CUP zijn ook gewone woorden)', () => {
    for (const word of ['ALL', 'TOP', 'CUP']) expect(CURRENCY_CODES as readonly string[]).not.toContain(word);
  });

  it('hoofdvaluta eerst in vaste volgorde, dan de overige gangbare, dan de rest op code', () => {
    const options = currencyOptions('EUR', 'en');
    const codes = options.map(o => o.code);
    expect(codes.slice(0, MAIN_CURRENCY_CODES.length)).toEqual([...MAIN_CURRENCY_CODES]);
    const rest = options.slice(MAIN_CURRENCY_CODES.length);
    expect(rest.some(o => o.main)).toBe(false);
    const firstOther = rest.findIndex(o => !o.common);
    expect(rest.slice(firstOther).some(o => o.common)).toBe(false);
    const sorted = (list: string[]) => [...list].sort();
    expect(rest.slice(0, firstOther).map(o => o.code)).toEqual(sorted(rest.slice(0, firstOther).map(o => o.code)));
    expect(rest.slice(firstOther).map(o => o.code)).toEqual(sorted(rest.slice(firstOther).map(o => o.code)));
    expect(rest.slice(0, firstOther).map(o => o.code)).toContain('NZD');
    expect(options.find(o => o.code === 'KWD')?.common).toBe(false);
  });

  it('korte lijst: de 20 hoofdvaluta, plus de huidige als die er niet bij zit', () => {
    expect(MAIN_CURRENCY_CODES).toHaveLength(20);
    for (const code of MAIN_CURRENCY_CODES) expect(CURRENCY_CODES as readonly string[]).toContain(code);
    expect(mainCurrencyOptions(currencyOptions('EUR', 'nl'), 'EUR').map(o => o.code)).toEqual([...MAIN_CURRENCY_CODES]);
    expect(mainCurrencyOptions(currencyOptions('KWD', 'nl'), 'KWD').map(o => o.code)).toEqual([...MAIN_CURRENCY_CODES, 'KWD']);
    // Ook een verouderde of geïmporteerde code blijft zichtbaar.
    expect(mainCurrencyOptions(currencyOptions('HRK', 'nl'), 'HRK').map(o => o.code)).toContain('HRK');
  });

  it('zoeken op naam in het Spaans, ook zonder accent', () => {
    const options = currencyOptions('EUR', 'es');
    expect(filterCurrencyOptions(options, 'colón')[0].code).toBe('CRC');
    expect(filterCurrencyOptions(options, 'colon')[0].code).toBe('CRC');
    const dolar = filterCurrencyOptions(options, 'dólar').map(o => o.code);
    expect(dolar).toEqual(expect.arrayContaining(['USD', 'CAD', 'AUD']));
    // Gangbare dollars voor de exotische.
    expect(dolar.indexOf('USD')).toBeLessThan(dolar.indexOf('BBD'));
  });

  it('zoeken op naam in het Nederlands en op code', () => {
    const options = currencyOptions('EUR', 'nl');
    const dollar = filterCurrencyOptions(options, 'dollar').map(o => o.code);
    expect(dollar).toEqual(expect.arrayContaining(['USD', 'CAD']));
    expect(dollar).not.toContain('EUR');
    expect(filterCurrencyOptions(options, 'koeweit')[0].code).toBe('KWD');
    expect(filterCurrencyOptions(options, 'crc')[0].code).toBe('CRC');
    expect(filterCurrencyOptions(options, 'KWD')[0].code).toBe('KWD');
    // Een exacte code wint van namen die met dezelfde letters beginnen.
    expect(filterCurrencyOptions(options, 'eur')[0].code).toBe('EUR');
    expect(filterCurrencyOptions(options, 'qqqq')).toEqual([]);
    expect(filterCurrencyOptions(options, '  ')).toBe(options);
  });

  it('een onbekende code uit een import staat in de lijst en is te vinden', () => {
    const options = currencyOptions('XAU', 'nl');
    expect(options.filter(o => o.code === 'XAU')).toHaveLength(1);
    expect(filterCurrencyOptions(options, 'xau')[0].code).toBe('XAU');
    // Rommel uit een bestand komt er niet in.
    expect(currencyOptions('euro', 'nl').some(o => o.code === 'euro')).toBe(false);
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
