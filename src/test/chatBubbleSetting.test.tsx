import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import SettingsDialog from '@/components/settings/SettingsDialog';
import { useAppStore } from '@/state/appStore';
import { defaultSettings } from '@/utils/settings';
import i18next from '@/i18n/config';

const mocks = vi.hoisted(() => ({ set: vi.fn(async () => {}) }));
vi.mock('@/utils/store', () => ({ storeGet: async () => null, storeSet: mocks.set, storeDelete: async () => {} }));

let node: HTMLDivElement, root: Root;
beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18next.changeLanguage('en');
  useAppStore.setState({ settings: { ...defaultSettings } });
  node = document.createElement('div'); document.body.append(node); root = createRoot(node);
});
afterEach(async () => { await act(async () => root.unmount()); node.remove(); });

it('the chat button is on by default and can be switched off in Preferences > Appearance', async () => {
  expect(defaultSettings.showChatBubble).toBe(true);
  await act(async () => root.render(<SettingsDialog open theme="light" onClose={vi.fn()} onThemeChange={vi.fn()} />));
  const tab = [...document.querySelectorAll<HTMLButtonElement>('[role=dialog] button')].find(b => b.textContent?.trim() === i18next.t('tabs.appearance', { ns: 'settings' }))!;
  await act(async () => tab.click());
  const box = document.querySelector<HTMLInputElement>('[role=dialog] input[name="showChatBubble"]')!;
  expect(box.checked).toBe(true);
  await act(async () => box.click());
  expect(box.checked).toBe(false);
  // Nothing is stored until Save.
  expect(useAppStore.getState().settings.showChatBubble).toBe(true);
  const save = [...document.querySelectorAll<HTMLButtonElement>('[role=dialog] button')].find(b => b.textContent?.trim() === i18next.t('save', { ns: 'common' }))!;
  await act(async () => save.click());
  expect(useAppStore.getState().settings.showChatBubble).toBe(false);
  expect(mocks.set).toHaveBeenCalled();
});

it('an older settings file without the key keeps the button on', async () => {
  const { loadSettings } = await import('@/utils/settings');
  expect((await loadSettings()).showChatBubble).toBe(true);
});
