import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CurrencyPicker } from '@/components/report/CurrencyPicker';
import { currencyOptions, MAIN_CURRENCY_CODES } from '@/utils/currencies';
import i18next from '@/i18n/config';

// Issue #81: valutakeuze met zoeken, ook met het toetsenbord.

let node: HTMLDivElement, root: Root;
const onChange = vi.fn();

function Harness({ initial, language }: { initial: string; language: string }) {
  const [value, setValue] = useState(initial);
  return <CurrencyPicker id="cur" value={value} options={currencyOptions(initial, language)} onChange={(code) => { onChange(code); setValue(code); }} />;
}

const field = () => node.querySelector<HTMLInputElement>('#cur')!;
const options = () => [...document.querySelectorAll<HTMLLIElement>('[role="option"]')];
// De lijst staat in een portal (document.body), niet in het veld zelf.
async function type(value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field(), value);
    field().dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function key(k: string) {
  await act(async () => { field().dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); });
}

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18next.changeLanguage('es');
  onChange.mockReset();
  node = document.createElement('div'); document.body.append(node); root = createRoot(node);
});
afterEach(async () => { await act(async () => root.unmount()); node.remove(); await i18next.changeLanguage('en'); });

describe('CurrencyPicker', () => {
  it('toont de gekozen valuta en kiest via typen, pijltje en Enter', async () => {
    await act(async () => root.render(<Harness initial="EUR" language="es" />));
    expect(field().value).toMatch(/^EUR · /);
    expect(field().getAttribute('role')).toBe('combobox');
    await type('colón');
    expect(field().getAttribute('aria-expanded')).toBe('true');
    expect(options()[0].textContent).toMatch(/^CRC · /);
    expect(field().getAttribute('aria-activedescendant')).toBe(options()[0].id);
    await key('Enter');
    expect(onChange).toHaveBeenCalledWith('CRC');
    expect(field().value).toMatch(/^CRC · colón/i);
    expect(document.querySelector('[role="listbox"]')).toBeNull();
  });

  it('pijltje omlaag opent de lijst op de huidige valuta', async () => {
    await act(async () => root.render(<Harness initial="KWD" language="es" />));
    await key('ArrowDown');
    const active = document.querySelector('[aria-selected="true"]');
    expect(active?.textContent).toMatch(/^KWD · /);
    // KWD staat achter de hoofdvaluta's; één omhoog is de laatste daarvan.
    await key('ArrowUp');
    await key('Enter');
    expect(onChange).toHaveBeenCalledWith('CNY');
  });

  it('Escape sluit alleen de lijst, niet de dialoog eromheen', async () => {
    const dialogClose = vi.fn();
    const listener = (e: KeyboardEvent) => { if (e.key === 'Escape') dialogClose(); };
    document.addEventListener('keydown', listener, true);
    try {
      await act(async () => root.render(<Harness initial="EUR" language="es" />));
      await type('dol');
      await key('Escape');
      expect(document.querySelector('[role="listbox"]')).toBeNull();
      expect(field().value).toMatch(/^EUR · /);
      expect(dialogClose).not.toHaveBeenCalled();
      // Lijst dicht: nu mag Escape de dialoog wel sluiten.
      await key('Escape');
      expect(dialogClose).toHaveBeenCalledTimes(1);
      expect(onChange).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener('keydown', listener, true);
    }
  });

  it('zonder typen alleen de hoofdvaluta; "alle valuta tonen" klapt uit met pijltje en Enter', async () => {
    await act(async () => root.render(<Harness initial="EUR" language="es" />));
    await key('ArrowDown');
    expect(options()).toHaveLength(MAIN_CURRENCY_CODES.length + 1);
    expect(options().slice(0, -1).map(o => o.textContent?.slice(0, 3))).toEqual([...MAIN_CURRENCY_CODES]);
    expect(options()[MAIN_CURRENCY_CODES.length].textContent).toBe(i18next.t('projectInfo.currencyShowAll'));
    for (let i = 0; i < MAIN_CURRENCY_CODES.length + 5; i++) await key('ArrowDown');
    expect(document.querySelector('[aria-selected="true"]')?.textContent).toBe(i18next.t('projectInfo.currencyShowAll'));
    await key('Enter');
    expect(onChange).not.toHaveBeenCalled();
    expect(options().length).toBeGreaterThan(100);
    expect(options().some(o => o.textContent?.startsWith('KWD'))).toBe(true);
    expect(options().some(o => o.textContent === i18next.t('projectInfo.currencyShowAll'))).toBe(false);
    // Opnieuw openen begint weer kort.
    await key('Escape');
    await key('ArrowDown');
    expect(options()).toHaveLength(MAIN_CURRENCY_CODES.length + 1);
  });

  it('zoeken gaat over alle valuta, ook buiten de korte lijst', async () => {
    await act(async () => root.render(<Harness initial="EUR" language="es" />));
    await type('kwd');
    expect(options()[0].textContent).toMatch(/^KWD · /);
    await key('Enter');
    expect(onChange).toHaveBeenCalledWith('KWD');
  });

  it('de huidige valuta buiten de hoofdvaluta staat in de korte lijst', async () => {
    await act(async () => root.render(<Harness initial="HRK" language="es" />));
    await key('ArrowDown');
    expect(document.querySelector('[aria-selected="true"]')?.textContent).toMatch(/^HRK/);
    expect(options()).toHaveLength(MAIN_CURRENCY_CODES.length + 2);
  });

  it('geen treffer: melding in de app-taal, Enter doet niets', async () => {
    await act(async () => root.render(<Harness initial="EUR" language="es" />));
    await type('qqqq');
    expect(document.querySelector('[role="listbox"]')?.textContent).toBe(i18next.t('projectInfo.currencyNoMatch'));
    await key('Enter');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('een geïmporteerde code buiten de lijst blijft staan', async () => {
    await act(async () => root.render(<Harness initial="XAU" language="es" />));
    expect(field().value).toMatch(/^XAU/);
  });
});
