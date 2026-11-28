import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Ribbon from '@/components/ribbon/Ribbon';
import { useAppStore } from '@/state/appStore';
import i18next from '@/i18n/config';

const initial = useAppStore.getState();
let node: HTMLDivElement, root: Root;
beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18next.changeLanguage('en');
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  useAppStore.setState(initial, true);
  useAppStore.getState().addDocument({ id: 'kb196', items: [] });
  node = document.createElement('div'); document.body.append(node); root = createRoot(node);
});
afterEach(async () => { await act(async () => root.unmount()); node.remove(); vi.unstubAllGlobals(); });

describe('knownbug 196: schuifrichting van het lint', () => {
  it('schuift naar rechts naar het contextuele tabblad Tekstopmaak', async () => {
    const s = useAppStore.getState();
    const chapter = s.addChapter(null);
    const text = s.addItem(chapter);
    useAppStore.setState({ items: useAppStore.getState().items.map(i => (i.id === text ? { ...i, rowType: 'tekstregel' } : i)) });
    await act(async () => root.render(<Ribbon />));
    // Pas nu wordt de tekstregel actief: het tabblad verschijnt zonder tabwissel.
    await act(async () => { useAppStore.setState({ activeItemId: text }); });
    const label = i18next.t('tabs.tekstopmaak', { ns: 'ribbon' });
    const tab = [...node.querySelectorAll<HTMLElement>('.ribbon-tabs button, .ribbon-tabs [role="tab"]')].find(el => el.textContent?.trim() === label);
    expect(tab).toBeTruthy();
    await act(async () => tab!.click());
    expect([...node.querySelectorAll('.ribbon-content-panel')].map(el => el.className).join('|')).toContain('ribbon-panel-enter-right');
    expect(node.querySelector('.ribbon-panel-enter-left')).toBeNull();
  });
});
