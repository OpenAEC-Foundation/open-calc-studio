import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import FeedbackDialog from '@/components/common/FeedbackDialog';
import i18next from '@/i18n/config';

// Issue #41: de feedback-API staat in CORS alleen Content-Type en Authorization
// toe. Een eigen User-Agent-header laat de preflight in WebKit/Firefox falen.
const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('@/utils/store', () => ({ storeGet: async () => null, storeSet: async () => {}, storeDelete: async () => {} }));
vi.mock('@/utils/platform', () => ({ getAppVersion: async () => 'synthetic' }));

let node: HTMLDivElement, root: Root;

async function input(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  await act(async () => {
    const proto = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function fillAndSubmit() {
  await act(async () => root.render(<FeedbackDialog open onClose={vi.fn()} />));
  await input(document.querySelector<HTMLInputElement>('.feedback-input')!, 'synthetic@example.invalid');
  await input(document.querySelector('textarea')!, 'Synthetic transport check, no actual feedback sent.');
  await act(async () => document.querySelector<HTMLButtonElement>('.feedback-submit-btn')!.click());
}

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18next.changeLanguage('en');
  node = document.createElement('div');
  document.body.append(node);
  root = createRoot(node);
  mocks.fetch.mockReset();
  vi.stubGlobal('fetch', mocks.fetch);
});

afterEach(async () => {
  await act(async () => root.unmount());
  node.remove();
  vi.unstubAllGlobals();
});

it('sends only CORS-allowed headers', async () => {
  mocks.fetch.mockResolvedValue({ ok: true, status: 200 });
  await fillAndSubmit();
  await vi.waitFor(() => expect(mocks.fetch).toHaveBeenCalledOnce());
  const [, init] = mocks.fetch.mock.calls[0] as [string, RequestInit];
  const names = Object.keys(init.headers ?? {}).map((name) => name.toLowerCase());
  expect(names).toEqual(['content-type']);
});

it('shows the server reason when the API rejects the feedback', async () => {
  mocks.fetch.mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: 'App identifier is required' }) });
  await fillAndSubmit();
  await vi.waitFor(() => expect(document.querySelector('.feedback-error')).toHaveTextContent('HTTP 400: App identifier is required'));
});

it('shows the network error when the request is blocked', async () => {
  mocks.fetch.mockRejectedValue(new TypeError('Failed to fetch'));
  await fillAndSubmit();
  await vi.waitFor(() => expect(document.querySelector('.feedback-error')).toHaveTextContent('Failed to fetch'));
});
