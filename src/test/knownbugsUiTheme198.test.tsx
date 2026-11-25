import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsDialog, { followSystemTheme } from '@/components/settings/SettingsDialog';
import i18next from '@/i18n/config';

let node: HTMLDivElement, root: Root;
let dark = false;
let listeners: Array<() => void> = [];
beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18next.changeLanguage('en');
  dark = false; listeners = [];
  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() { return query.includes('dark') && dark; },
    media: query,
    addEventListener: (_: string, fn: () => void) => { listeners.push(fn); },
    removeEventListener: (_: string, fn: () => void) => { listeners = listeners.filter(l => l !== fn); },
  }));
  node = document.createElement('div'); document.body.append(node); root = createRoot(node);
});
afterEach(async () => { await act(async () => root.unmount()); node.remove(); vi.unstubAllGlobals(); });

describe('knownbug 198: thema "system"', () => {
  it('Instellingen houdt "system" vast in plaats van er "light" van te maken', async () => {
    const onThemeChange = vi.fn();
    await act(async () => root.render(<SettingsDialog open theme="system" onClose={vi.fn()} onThemeChange={onThemeChange} />));
    await act(async () => document.querySelectorAll<HTMLButtonElement>('.settings-tab')[1].click());
    const select = document.querySelector<HTMLSelectElement>('.settings-content select')!;
    expect(select.value).toBe('system');
    await act(async () => document.querySelector<HTMLButtonElement>('.settings-btn-primary')!.click());
    expect(onThemeChange).toHaveBeenCalledWith('system');
  });

  it('volgt een live wissel van het besturingssysteem', () => {
    const stop = followSystemTheme('system');
    dark = true;
    listeners.forEach(fn => fn());
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    dark = false;
    listeners.forEach(fn => fn());
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    stop();
    expect(listeners).toHaveLength(0);
    expect(followSystemTheme('dark')).toBeTypeOf('function');
    expect(listeners).toHaveLength(0);
  });
});
