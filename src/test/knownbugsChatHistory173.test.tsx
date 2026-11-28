import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { useAppStore } from '@/state/appStore';
import { createDefaultItems } from '@/data/defaultBudget';
import { changeLanguage } from '@/i18n/config';
import { localStore } from '@/utils/browserStorage';
import type { ChatMessage } from '@/state/slices/chatSlice';

// Knownbug 173: de chatgeschiedenis groeide onbeperkt, ging volledig mee naar de AI en
// was niet te wissen; een gesloten document liet zijn chat achter.
const initial = useAppStore.getState();
let root: Root, node: HTMLDivElement;
const msg = (i: number): ChatMessage => ({ id: `m${i}`, role: i % 2 ? 'assistant' : 'user', content: `bericht ${i}`, timestamp: i, status: 'done' });

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

describe('assistant chat history (knownbug 173)', () => {
  it('drops the chat of a closed document', () => {
    useAppStore.getState().addDocument({ id: 'other-doc', items: [] });
    useAppStore.getState().appendChatMessage('other-doc', msg(0));
    useAppStore.getState().removeDocument('other-doc');
    expect(useAppStore.getState().chats['other-doc']).toBeUndefined();
  });

  it('sends a bounded history that starts with a user message', async () => {
    localStore.setItem('ocs-anthropic-key', 'test-key');
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    for (let i = 0; i < 101; i++) useAppStore.getState().appendChatMessage('chat-doc', msg(i));
    await act(async () => root.render(<ChatPanel embedded />));
    const area = node.querySelector<HTMLTextAreaElement>('.chat-input')!;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
    await act(async () => { setter.call(area, 'Nog een vraag'); area.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => node.querySelector<HTMLButtonElement>('.chat-send')!.click());
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.messages.length).toBeLessThanOrEqual(21);
    expect(body.messages[0].role).toBe('user');
    expect(body.messages.at(-1)).toEqual({ role: 'user', content: 'Nog een vraag' });
  });

  it('can clear the conversation of the open estimate', async () => {
    useAppStore.getState().appendChatMessage('chat-doc', msg(0));
    await act(async () => root.render(<ChatPanel embedded />));
    const clear = node.querySelector<HTMLButtonElement>('.chat-clear');
    expect(clear).not.toBeNull();
    await act(async () => clear!.click());
    expect(useAppStore.getState().chats['chat-doc'] ?? []).toHaveLength(0);
  });
});
