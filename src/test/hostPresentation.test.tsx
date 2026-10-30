import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { readHostPresentation, useHostPresentation } from '@/hooks/useHostPresentation';
import type { SiteHost } from '@/services/file/siteHost';
import { useAppStore } from '@/state/appStore';
import i18next from '@/i18n/config';

const initial = useAppStore.getState();
let root: Root, node: HTMLDivElement;
function host(extra: Partial<SiteHost> = {}): SiteHost {
  return { open: async () => { throw Error('unused'); }, save: async () => { throw Error('unused'); }, list: async () => [], versions: async () => [], ...extra };
}
function Harness({ ready = true }: { ready?: boolean }) {
  const [theme, setTheme] = useState('dark');
  const hosted = useHostPresentation(ready, setTheme);
  return <div data-hosted={String(hosted)} data-theme={theme}>{!hosted && <header>Own title bar</header>}</div>;
}
beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  delete window.openaecHost;
  history.replaceState(null, '', '/');
  useAppStore.setState(initial, true);
  await i18next.changeLanguage('en');
  node = document.createElement('div'); document.body.append(node); root = createRoot(node);
});
afterEach(async () => { await act(async () => root.unmount()); node.remove(); delete window.openaecHost; history.replaceState(null, '', '/'); vi.restoreAllMocks(); });
it('keeps standalone presentation and ignores host hash preferences outside a hosted context', async () => {
  history.replaceState(null, '', '/#taal=nl&thema=light');
  await act(async () => root.render(<Harness />));
  expect(node.querySelector('header')).toBeTruthy(); expect(node.firstElementChild?.getAttribute('data-theme')).toBe('dark'); expect(i18next.language).toBe('en');
});
it('takes Dutch aliases from a late host, hides own chrome and leaves budget/history unchanged', async () => {
  const before = { items: useAppStore.getState().items, undo: useAppStore.getState().undoStack, docs: useAppStore.getState().documents };
  await act(async () => root.render(<Harness />));
  window.openaecHost = host({ taal: 'nl-NL', thema: 'blueprint' });
  await act(async () => window.dispatchEvent(new Event('openaec-host-ready')));
  expect(node.querySelector('header')).toBeNull(); expect(node.firstElementChild?.getAttribute('data-theme')).toBe('blueprint');
  await vi.waitFor(() => expect(i18next.language).toBe('nl'));
  expect(useAppStore.getState()).toMatchObject({ items: before.items, undoStack: before.undo, documents: before.docs });
});
it('applies updated preferences on the same host object and restores standalone chrome after removal', async () => {
  window.openaecHost = host({ locale: 'en', theme: 'dark' });
  await act(async () => root.render(<Harness />));
  window.openaecHost.theme = 'high-contrast-light'; window.openaecHost.locale = 'nl';
  await act(async () => window.dispatchEvent(new Event('openaec-host-preferences')));
  expect(node.firstElementChild?.getAttribute('data-theme')).toBe('high-contrast-light');
  await vi.waitFor(() => expect(i18next.language).toBe('nl'));
  delete window.openaecHost; await act(async () => window.dispatchEvent(new Event('openaec-host-ready')));
  expect(node.querySelector('header')).toBeTruthy();
});
it('uses the SuperCloud hash when the host supplies no presentation preferences', async () => {
  window.openaecHost = host(); history.replaceState(null, '', '/#app=calc&taal=nl&thema=dark');
  await act(async () => root.render(<Harness />));
  expect(node.firstElementChild?.getAttribute('data-theme')).toBe('dark'); await vi.waitFor(() => expect(i18next.language).toBe('nl'));
});
it('defaults hosted sessions to light and rejects unsupported preference values', () => {
  window.openaecHost = host({ locale: 'not-a-language', theme: 'javascript:invalid' });
  expect(readHostPresentation()).toEqual({ locale: undefined, theme: 'light' });
});
it('waits for settings hydration before applying host preferences', async () => {
  window.openaecHost = host({ locale: 'nl', theme: 'light' });
  await act(async () => root.render(<Harness ready={false} />));
  expect(node.firstElementChild?.getAttribute('data-theme')).toBe('dark'); expect(i18next.language).toBe('en');
  await act(async () => root.render(<Harness ready />));
  expect(node.firstElementChild?.getAttribute('data-theme')).toBe('light'); await vi.waitFor(() => expect(i18next.language).toBe('nl'));
});
