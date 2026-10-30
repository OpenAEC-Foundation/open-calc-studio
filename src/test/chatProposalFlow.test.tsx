import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { useAppStore } from '@/state/appStore';
import { createDefaultItems } from '@/data/defaultBudget';
import { changeLanguage } from '@/i18n/config';
import { localStore } from '@/utils/browserStorage';

const initial = useAppStore.getState();
let root: Root, node: HTMLDivElement;
beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await changeLanguage('en'); localStore.removeItem('ocs-anthropic-key');
  useAppStore.setState({ ...initial, chats: {}, accountsUser: null }, true);
  const state = useAppStore.getState(); state.addDocument({ id: 'chat-preview', items: createDefaultItems() });
  const chapter = state.addChapter(null); state.addItem(chapter);
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
  node = document.createElement('div'); document.body.append(node); root = createRoot(node);
});
afterEach(async () => { await act(async () => root.unmount()); node.remove(); });
async function prepareFromUi() {
  await act(async () => root.render(<ChatPanel embedded />));
  const chip = [...node.querySelectorAll<HTMLButtonElement>('.chat-chip')].find(button => button.textContent?.startsWith('Add under'))!;
  await act(async () => chip.click());
  await act(async () => node.querySelector<HTMLButtonElement>('.chat-send')!.click());
  await vi.waitFor(() => expect(node.textContent).toContain('Financial preview'));
}
function button(text: string) { return [...node.querySelectorAll('button')].find(button => button.textContent === text)!; }
describe('assistant proposal UI', () => {
  it('requires review before adding a line and provides one button to undo the complete proposal', async () => {
    const before = useAppStore.getState().items;
    await prepareFromUi(); expect(useAppStore.getState().items).toBe(before);
    expect(node.textContent).toContain('Total excl. VAT'); expect(node.textContent).toContain('Concrete C30');
    await act(async () => button('Apply to estimate').click());
    expect(useAppStore.getState().items.find(item => item.description === 'Concrete C30')?.quantity).toBe(12);
    expect(useAppStore.getState().undoStack).toHaveLength(1);
    await act(async () => button('Undo entire proposal').click());
    expect(useAppStore.getState().items.some(item => item.description === 'Concrete C30')).toBe(false);
    expect(node.textContent).toContain('The entire proposal was undone.');
  });
  it('discards a proposal without changing rows or history', async () => {
    const before = useAppStore.getState().items;
    await prepareFromUi(); await act(async () => button('Discard').click());
    expect(useAppStore.getState().items).toBe(before); expect(useAppStore.getState().undoStack).toHaveLength(0);
    expect(node.textContent).toContain('Proposal discarded.');
  });
});
