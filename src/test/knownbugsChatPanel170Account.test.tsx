import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { useAppStore } from '@/state/appStore';
import { createDefaultItems } from '@/data/defaultBudget';
import { changeLanguage } from '@/i18n/config';
import { hasUnclosedActionBlock } from '@/services/assistant/assistantActions';

// De OpenAEC-accountroute staat alleen aan in builds met VITE_OPENAEC_ENABLED.
vi.mock('@/services/buildFlags', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/buildFlags')>()),
  OPENAEC_ENABLED: true,
}));

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
});

async function ask(answer: string) {
  const complete = vi.fn(async () => answer);
  useAppStore.setState({
    accountsUser: { sub: 'u', name: 'Test', email: 'test@example.invalid' },
    accountsAiComplete: complete,
    accountsLoadCredits: vi.fn(async () => {}),
  });
  await act(async () => root.render(<ChatPanel embedded />));
  const area = node.querySelector<HTMLTextAreaElement>('.chat-input')!;
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
  await act(async () => { setter.call(area, 'Add 30 lines'); area.dispatchEvent(new Event('input', { bubbles: true })); });
  await act(async () => node.querySelector<HTMLButtonElement>('.chat-send')!.click());
  await vi.waitFor(() => expect(node.querySelector('.chat-typing')).toBeNull());
  expect(complete).toHaveBeenCalledTimes(1);
  const messages = useAppStore.getState().chats['chat-doc'];
  return messages[messages.length - 1];
}

describe('assistant chat via the OpenAEC account (knownbug 170)', () => {
  it('reports a cut-off answer instead of showing half an action block', async () => {
    const last = await ask('Here you go:\n```ocs-acties\n{"acties":[{"type":"add_regel","onderNr":"21');
    expect(last.status).toBe('error');
    expect(last.content).not.toContain('ocs-acties');
    expect(last.content).toContain('cut off');
  });

  it('still accepts a complete answer', async () => {
    const last = await ask('Total is fine.');
    expect(last.status).not.toBe('error');
    expect(last.content).toContain('Total is fine.');
  });
});

describe('hasUnclosedActionBlock', () => {
  it('only flags an action block without a closing fence', () => {
    expect(hasUnclosedActionBlock('```ocs-acties\n{"acties":[')).toBe(true);
    expect(hasUnclosedActionBlock('```ocs-acties\n{"acties":[]}\n```')).toBe(false);
    expect(hasUnclosedActionBlock('No actions here.')).toBe(false);
  });
});
