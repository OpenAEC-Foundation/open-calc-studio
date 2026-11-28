import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import HomeTab from '@/components/ribbon/HomeTab';
import { useAppStore } from '@/state/appStore';
import i18next from '@/i18n/config';

const initial = useAppStore.getState();
let node: HTMLDivElement, root: Root;
beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18next.changeLanguage('en');
  useAppStore.setState(initial, true);
  useAppStore.getState().addDocument({ id: 'kb41', items: [] });
  const s = useAppStore.getState();
  s.pushHistory(s.items, 'stap');
  s.addChapter(null);
  node = document.createElement('div'); document.body.append(node); root = createRoot(node);
  await act(async () => root.render(<HomeTab />));
});
afterEach(async () => { await act(async () => root.unmount()); node.remove(); });

const click = (el: Element) => act(async () => {
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  (el as HTMLElement).click();
});
const openMenus = () => document.querySelectorAll('.ribbon-undo-dropdown').length;

describe('knownbug 41: Undo-lijst en Inklappen', () => {
  it('staan nooit tegelijk open', async () => {
    const undoToggle = node.querySelector('.ribbon-undo-dropdown-toggle')!;
    const collapse = [...node.querySelectorAll('button')].find(b => b.textContent?.trim() === i18next.t('home.collapse', { ns: 'ribbon' }))!;
    expect(collapse).toBeTruthy();
    await click(undoToggle);
    expect(openMenus()).toBe(1);
    await click(collapse);
    expect(openMenus()).toBe(1);
    expect(document.querySelector('.ribbon-undo-dropdown-header')?.textContent).toBe(i18next.t('home.collapseTo', { ns: 'ribbon' }));
    await click(undoToggle);
    expect(openMenus()).toBe(1);
    expect(document.querySelector('.ribbon-undo-dropdown-header')?.textContent).toBe(i18next.t('home.undoUpTo', { ns: 'ribbon' }));
  });
});
