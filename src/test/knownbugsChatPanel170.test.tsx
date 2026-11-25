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
  await changeLanguage('en');
  useAppStore.setState({ ...initial, chats: {}, accountsUser: null }, true);
  useAppStore.getState().addDocument({ id: 'chat-doc', items: createDefaultItems() });
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
  node = document.createElement('div'); document.body.append(node); root = createRoot(node);
});
afterEach(async () => {
  await act(async () => root.unmount()); node.remove();
  localStore.removeItem('ocs-anthropic-key'); vi.unstubAllGlobals();
});

async function type(text: string) {
  const area = node.querySelector<HTMLTextAreaElement>('.chat-input')!;
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
  await act(async () => { setter.call(area, text); area.dispatchEvent(new Event('input', { bubbles: true })); });
  return area;
}

describe('assistant chat (knownbug 170)', () => {
  it('asks for enough tokens and reports a cut-off answer instead of showing half an action block', async () => {
    localStore.setItem('ocs-anthropic-key', 'test-key');
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      content: [{ type: 'text', text: 'Here you go:\n```ocs-acties\n{"acties":[{"type":"add_regel","onderNr":"21' }],
      stop_reason: 'max_tokens',
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await act(async () => root.render(<ChatPanel embedded />));
    await type('Add 30 lines');
    await act(async () => node.querySelector<HTMLButtonElement>('.chat-send')!.click());
    await vi.waitFor(() => expect(node.querySelector('.chat-typing')).toBeNull());
    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.max_tokens).toBeGreaterThanOrEqual(4096);
    const last = useAppStore.getState().chats['chat-doc'].at(-1)!;
    expect(last.status).toBe('error');
    expect(last.content).not.toContain('ocs-acties');
    expect(last.content).toContain('cut off');
  });
});

describe('assistant chat input (knownbug 172)', () => {
  it('does not send while an IME composition is still running', async () => {
    await act(async () => root.render(<ChatPanel embedded />));
    const area = await type('totaal');
    await act(async () => { area.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, isComposing: true })); });
    expect(useAppStore.getState().chats['chat-doc'] ?? []).toHaveLength(0);
    await act(async () => { area.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    await vi.waitFor(() => expect(useAppStore.getState().chats['chat-doc']).toHaveLength(2));
  });
  it('does not send with Enter when no document is open', async () => {
    useAppStore.setState({ activeDocumentId: '' });
    await act(async () => root.render(<ChatPanel embedded />));
    const area = await type('totaal');
    await act(async () => { area.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    expect(useAppStore.getState().chats['']).toBeUndefined();
  });
});
