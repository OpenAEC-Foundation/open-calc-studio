import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useAppStore } from '@/state/appStore';
import { changeLanguage } from '@/i18n/config';
import { UrenStaartView } from '@/components/grid/WpCalcBottomPanel';
import { setNumberFormatPreference, setNumberLocale } from '@/utils/formatting';

// Knownbug 267: het tariefveld in het urenoverzicht toonde "64.00" (punt),
// maar las een getypte "1.250" als duizendtal (1250). Het veld toont nu de
// getalnotatie van de gebruiker en leest in diezelfde notatie terug.

const initial = useAppStore.getState();
let root: Root | undefined;
let node: HTMLDivElement;

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await changeLanguage('en');
  setNumberFormatPreference('auto');
  useAppStore.setState(initial, true);
  const state = useAppStore.getState();
  state.addDocument({ id: 'rate-doc', items: [] });
  const rule = state.addRegel(state.addItem(state.addChapter(null)));
  state.updateTarieven({ A: 64, B: 43, C: 82 });
  state.updateItem(rule, 'tariefGroep', 'A');
  state.updateItem(rule, 'quantity', 1);
  state.updateItem(rule, 'normQuantity', 1);
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  node?.remove();
  setNumberFormatPreference('auto');
  setNumberLocale('nl-NL');
});

async function renderView() {
  node = document.createElement('div');
  document.body.appendChild(node);
  root = createRoot(node);
  await act(async () => root!.render(<UrenStaartView />));
}

const rateInput = () => node.querySelector<HTMLInputElement>('input.tarief-input')!;
const rateA = () => useAppStore.getState().schedule.tarieven?.A;

async function type(input: HTMLInputElement, value: string) {
  await act(async () => { input.focus(); input.value = value; input.blur(); });
}

describe('knownbug 267: tariefveld volgt de getalnotatie', () => {
  it('Engelse notatie: toont "64.00" en leest "1.250" als 1,25', async () => {
    setNumberLocale('en');
    await renderView();
    expect(rateInput().value).toBe('64.00');
    await type(rateInput(), '1.250');
    expect(rateA()).toBe(1.25);
  });

  it('Nederlandse notatie: toont "64,00"; "1,25" is 1,25 en "1.250" is 1250, zoals overal in NL', async () => {
    setNumberLocale('nl-NL');
    await renderView();
    expect(rateInput().value).toBe('64,00');
    await type(rateInput(), '1,25');
    expect(rateA()).toBe(1.25);
    await type(rateInput(), '1.250');
    expect(rateA()).toBe(1250);
    expect(rateInput().value).toBe('1.250,00');
  });

  it('vaste notatie 1,234.56 bij een Nederlandse app: tonen en lezen gaan in dezelfde notatie', async () => {
    setNumberLocale('nl');
    setNumberFormatPreference('en-US');
    await renderView();
    expect(rateInput().value).toBe('64.00');
    await type(rateInput(), '1.250');
    expect(rateA()).toBe(1.25);
  });

  it('een ongewijzigd veld verlaten verandert niets (ook niet bij een tarief met meer decimalen)', async () => {
    useAppStore.getState().updateTarieven({ A: 64.125, B: 43, C: 82 });
    setNumberLocale('nl-NL');
    await renderView();
    expect(rateInput().value).toBe('64,13');
    await act(async () => { rateInput().focus(); rateInput().blur(); });
    expect(rateA()).toBe(64.125);
    expect(useAppStore.getState().undoStack).toHaveLength(0);
  });
});
