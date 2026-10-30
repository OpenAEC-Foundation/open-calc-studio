import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import Backstage from '@/components/backstage/Backstage';
import TitleBar from '@/components/layout/TitleBar';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { OPENAEC_ENABLED, PLATFORM_BUILD, USER_EXTENSIONS_ENABLED } from '@/services/buildFlags';
import { loadAllExtensions } from '@/extensions/extensionLoader';
import { createExtensionApi } from '@/extensions/extensionApi';
import { useAppStore } from '@/state/appStore';
import { localStore } from '@/utils/browserStorage';
import i18next, { changeLanguage } from '@/i18n/config';

const initial = useAppStore.getState();
let root: Root, node: HTMLDivElement;
beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await changeLanguage('en'); useAppStore.setState(initial, true);
  useAppStore.getState().addDocument({ id: 'platform-policy', items: [] });
  useAppStore.setState({ accountsLoadUser: vi.fn(async () => {}) });
  node = document.createElement('div'); document.body.append(node); root = createRoot(node);
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
});
afterEach(async () => { await act(async () => root.unmount()); node.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStore.removeItem('ocs-anthropic-key'); localStore.removeItem('i18nextLng'); localStore.removeItem('ocs-ext:policy:color'); localStore.removeItem('ext:policy:color'); });

it('loads the actual platform profile with own accounts and user extensions disabled', () => {
  expect(PLATFORM_BUILD).toBe(true); expect(OPENAEC_ENABLED).toBe(false); expect(USER_EXTENSIONS_ENABLED).toBe(false);
});
it('does not expose cloud login, feedback or extension-management routes', async () => {
  await act(async () => root.render(<TitleBar />));
  expect(node.querySelector('.openaec-signin-btn')).toBeNull(); expect(node.querySelector('.send-feedback-btn')).toBeNull();
  expect(useAppStore.getState().accountsLoadUser).not.toHaveBeenCalled();
  await act(async () => root.render(<Backstage open onClose={() => {}} />));
  const labels = [...node.querySelectorAll('.backstage-item-label')].map(element => element.textContent);
  expect(labels).not.toContain(i18next.t('cloud', { ns: 'backstage' }));
  expect(labels).not.toContain(i18next.t('extensions', { ns: 'backstage' }));
  expect(node.querySelector('.cloud-panel')).toBeNull();
});
it('ignores a pre-existing personal AI key when the user sends a chat message', async () => {
  localStore.setItem('ocs-anthropic-key', 'synthetic-key-that-must-not-be-used');
  const fetch = vi.fn(async () => { throw Error('No external request is permitted'); }); vi.stubGlobal('fetch', fetch);
  await act(async () => root.render(<ChatPanel embedded />));
  await act(async () => node.querySelector<HTMLButtonElement>('.chat-chip')!.click());
  await act(async () => node.querySelector<HTMLButtonElement>('.chat-send')!.click());
  await vi.waitFor(() => expect(useAppStore.getState().chats['platform-policy'].find(message => message.role === 'assistant')?.status).toBe('done'));
  expect(fetch).not.toHaveBeenCalled(); expect(node.querySelector('input[type=password]')).toBeNull();
});
it('does not read installed user code from IndexedDB during platform startup', async () => {
  const open = vi.fn(() => { throw Error('User extension storage must not be opened'); });
  vi.stubGlobal('indexedDB', { open }); await loadAllExtensions(); expect(open).not.toHaveBeenCalled();
});
it('isolates extension preferences from another tool with the old generic key', () => {
  localStore.setItem('ext:policy:color', JSON.stringify('other-tool'));
  const api = createExtensionApi('policy', []);
  expect(api.settings.get('color', 'default')).toBe('default');
  api.settings.set('color', 'calc');
  expect(api.settings.get('color', 'default')).toBe('calc'); expect(localStore.getItem('ext:policy:color')).toBe(JSON.stringify('other-tool'));
});
it('detects the Calc language without reading a generic i18next preference from another tool', () => {
  localStore.setItem('i18nextLng', 'de'); localStore.setItem('ocs-i18nextLng', 'nl');
  const detected = i18next.services.languageDetector.detect();
  expect(Array.isArray(detected) ? detected : [detected]).toContain('nl');
  expect(Array.isArray(detected) ? detected : [detected]).not.toContain('de');
});
