import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Issue #65: instelling "Getalnotatie". Bestaande installaties houden
// 1.234,56 (ook met de standaard-Engelse interface); nieuwe volgen de taal.

const stored = vi.hoisted(() => ({ value: null as unknown }));
vi.mock('@/utils/store', () => ({
  storeGet: async () => stored.value,
  storeSet: async () => {},
  storeDelete: async () => {},
}));

import { loadSettings } from '@/utils/settings';
import {
  formatNumber, getNumberLocale, parseLocaleNumber, setNumberFormatPreference, setNumberLocale,
} from '@/utils/formatting';
import { parseNumericInput } from '@/utils/numericInput';

afterEach(() => {
  setNumberFormatPreference('auto');
  setNumberLocale('nl-NL');
});

describe('loadSettings: standaard voor de getalnotatie', () => {
  beforeEach(() => { stored.value = null; });

  it('nieuwe installatie (niets opgeslagen) volgt de app-taal', async () => {
    expect((await loadSettings()).numberFormat).toBe('auto');
  });

  it('bestaande installatie zonder de instelling houdt 1.234,56', async () => {
    stored.value = { locale: 'en', recentFiles: ['C:/begroting.ocs'] };
    expect((await loadSettings()).numberFormat).toBe('nl-NL');
  });

  it('een eerder gemaakte keuze blijft staan', async () => {
    stored.value = { locale: 'en', numberFormat: 'auto' };
    expect((await loadSettings()).numberFormat).toBe('auto');
    stored.value = { locale: 'nl', numberFormat: 'en-US' };
    expect((await loadSettings()).numberFormat).toBe('en-US');
  });
});

describe('vaste notatie wint van de app-taal', () => {
  it('Engelse interface met 1.234,56: "2,500" blijft 2,5', () => {
    setNumberLocale('en');
    setNumberFormatPreference('nl-NL');
    expect(getNumberLocale()).toBe('nl-NL');
    expect(formatNumber(1234.5)).toBe('1.234,50');
    expect(parseNumericInput('2,500')).toBe(2.5);
    expect(parseLocaleNumber('1.234')).toBe(1234);
  });

  it('Nederlandse interface met 1,234.56', () => {
    setNumberLocale('nl');
    setNumberFormatPreference('en-US');
    expect(formatNumber(1234.5)).toBe('1,234.50');
    expect(parseNumericInput('2,500')).toBe(2500);
  });

  it('"volgt de app-taal" en een onbekende waarde volgen de taal', () => {
    setNumberLocale('en');
    setNumberFormatPreference('auto');
    expect(formatNumber(1234.5)).toBe('1,234.50');
    setNumberFormatPreference('iets-raars');
    expect(getNumberLocale()).toBe('en');
    // Taalwissel met vaste notatie: de notatie blijft vast.
    setNumberFormatPreference('nl-NL');
    setNumberLocale('fr');
    expect(getNumberLocale()).toBe('nl-NL');
  });
});

describe('koppeling met de instellingen in de app', () => {
  it('een andere instelling verandert de notatie direct', async () => {
    const { useAppStore } = await import('@/state/appStore');
    await import('@/i18n/numberFormatSync');
    setNumberLocale('en');
    const settings = useAppStore.getState().settings;
    useAppStore.setState({ settings: { ...settings, numberFormat: 'nl-NL' } });
    expect(getNumberLocale()).toBe('nl-NL');
    useAppStore.setState({ settings: { ...settings, numberFormat: 'auto' } });
    expect(getNumberLocale()).not.toBe('nl-NL');
  });
});
