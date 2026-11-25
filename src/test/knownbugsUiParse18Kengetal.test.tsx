import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { ProjectInfoSettings } from '@/components/report/ProjectInfoSettings';
import { useAppStore } from '@/state/appStore';
import i18next from '@/i18n/config';

const initial = useAppStore.getState();
let node: HTMLDivElement, root: Root;
beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18next.changeLanguage('nl');
  useAppStore.setState(initial, true);
  useAppStore.getState().addDocument({ id: 'kb18', items: [] });
  useAppStore.setState(s => ({ schedule: { ...s.schedule, projectProperties: [{ id: 'bvo', name: 'BVO', value: 120, unit: 'm²', isDefault: true }] } }));
  node = document.createElement('div'); document.body.append(node); root = createRoot(node);
  await act(async () => root.render(<ProjectInfoSettings />));
});
afterEach(async () => { await act(async () => root.unmount()); node.remove(); });

async function typeKengetal(value: string) {
  const cell = [...node.querySelectorAll<HTMLElement>('td div')].find(el => el.textContent === '120,00')!;
  expect(cell).toBeTruthy();
  const td = cell.closest('td')!;
  await act(async () => cell.click());
  const input = td.querySelector<HTMLInputElement>('input')!;
  expect(input).toBeTruthy();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
}
const bvo = () => useAppStore.getState().schedule.projectProperties![0].value;

it('knownbug 18 (gevolg): onleesbare invoer bij een kengetal wist de waarde niet', async () => {
  await typeKengetal('130 m2');
  expect(bvo()).toBe(120);
});
it('een geldig getal wordt wel overgenomen', async () => {
  await typeKengetal('1.250,5');
  expect(bvo()).toBe(1250.5);
});
