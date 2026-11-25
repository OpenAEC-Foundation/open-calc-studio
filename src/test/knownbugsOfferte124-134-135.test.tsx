import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useAppStore } from '@/state/appStore';
import { changeLanguage } from '@/i18n/config';
import { createDefaultOfferte } from '@/state/slices/offerteSlice';
import { buildOfferteRequest } from '@/services/offerte/offerteRequest';
import { OfferteView } from '@/components/offerte/OfferteView';

const initial = useAppStore.getState();
const oldTz = process.env.TZ;
let root: Root | undefined, node: HTMLDivElement;

beforeAll(() => { process.env.TZ = 'Europe/Amsterdam'; });
afterAll(() => { process.env.TZ = oldTz; });
beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await changeLanguage('en');
  useAppStore.setState(initial, true);
  useAppStore.getState().resetOfferte();
});
afterEach(async () => {
  vi.useRealTimers();
  if (root) await act(async () => root!.unmount());
  root = undefined; node?.remove();
});

async function renderView() {
  node = document.createElement('div'); document.body.append(node); root = createRoot(node);
  await act(async () => root!.render(<OfferteView />));
}

function typeInto(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('offerte (knownbugs 124, 134, 135)', () => {
  it('124: de standaarddatum is de lokale datum, ook net na middernacht', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // 15 januari 00:30 in Amsterdam = 14 januari 23:30 UTC
    vi.setSystemTime(new Date(Date.UTC(2026, 0, 14, 23, 30)));
    expect(createDefaultOfferte().offerteDatum).toBe('2026-01-15');
  });

  it('134: een negatieve of gebroken geldigheid gaat als positief geheel getal naar de PDF', () => {
    useAppStore.getState().setOfferteField({ geldigheid: -5 });
    expect(buildOfferteRequest().offerte.geldigheid).toBe(1);
    useAppStore.getState().setOfferteField({ geldigheid: 12.6 });
    expect(buildOfferteRequest().offerte.geldigheid).toBe(13);
    useAppStore.getState().setOfferteField({ geldigheid: Number.NaN });
    expect(buildOfferteRequest().offerte.geldigheid).toBe(30);
  });

  it('134: een leeggemaakt geldigheidsveld springt niet terug op 30 en negatief wordt niet bewaard', async () => {
    useAppStore.getState().setOfferteField({ geldigheid: 45 });
    useAppStore.getState().setActiveSectionId('__meta');
    await renderView();
    const input = node.querySelector<HTMLInputElement>('input[type="number"]')!;
    expect(input.min).toBe('1');
    await act(async () => typeInto(input, ''));
    expect(input.value).toBe('');
    expect(useAppStore.getState().offerte.geldigheid).toBe(45);
    await act(async () => typeInto(input, '-3'));
    expect(useAppStore.getState().offerte.geldigheid).toBe(45);
    await act(async () => typeInto(input, '60'));
    expect(useAppStore.getState().offerte.geldigheid).toBe(60);
  });

  it('135: termijnen die samen 100 % zijn (10,1 + 64,1 + 25,8) zijn niet rood', async () => {
    const state = useAppStore.getState();
    state.setOfferteField({ betalingstermijnen: [
      { id: 'a', beschrijving: 'A', percentage: 10.1, toelichting: '' },
      { id: 'b', beschrijving: 'B', percentage: 64.1, toelichting: '' },
      { id: 'c', beschrijving: 'C', percentage: 25.8, toelichting: '' },
    ] });
    state.setActiveSectionId('__termijnen');
    await renderView();
    const total = node.querySelector<HTMLElement>('.termijn-total')!;
    expect(total.style.color).not.toBe('rgb(220, 38, 38)');
    expect(total.textContent).toContain('100%');
    expect(total.textContent).not.toContain('99.99');
    expect(total.textContent).not.toMatch(/must/i);
  });
});
