import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import SettingsDialog from '@/components/settings/SettingsDialog';
import { useAppStore } from '@/state/appStore';
import { defaultSettings } from '@/utils/settings';
import i18next from '@/i18n/config';

vi.mock('@/utils/store', () => ({ storeGet: async () => null, storeSet: async () => {}, storeDelete: async () => {} }));

let node: HTMLDivElement, root: Root;
beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18next.changeLanguage('en');
  node = document.createElement('div'); document.body.append(node); root = createRoot(node);
});
afterEach(async () => { await act(async () => root.unmount()); node.remove(); });

const languageSelect = () => document.querySelectorAll<HTMLSelectElement>('[role=dialog] select.settings-select')[0];
const saveButton = () => [...document.querySelectorAll<HTMLButtonElement>('[role=dialog] button')].find(b => b.textContent?.trim() === i18next.t('save', { ns: 'common' }))!;

it('keeps "Auto-detect" selected and saved when that is the stored choice (knownbug 229)', async () => {
  // i18next draait dan op de gedetecteerde taal (hier en), de opgeslagen keuze is "auto".
  useAppStore.setState({ settings: { ...defaultSettings, locale: 'auto' } });
  await act(async () => root.render(<SettingsDialog open theme="light" onClose={vi.fn()} onThemeChange={vi.fn()} />));
  expect(languageSelect().value).toBe('auto');
  await act(async () => saveButton().click());
  expect(useAppStore.getState().settings.locale).toBe('auto');
});

it('shows an explicitly chosen language as that language', async () => {
  useAppStore.setState({ settings: { ...defaultSettings, locale: 'en' } });
  await act(async () => root.render(<SettingsDialog open theme="light" onClose={vi.fn()} onThemeChange={vi.fn()} />));
  expect(languageSelect().value).toBe('en');
});
