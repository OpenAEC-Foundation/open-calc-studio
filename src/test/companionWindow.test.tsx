import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useAppStore } from '@/state/appStore';
import { openCompanionWindow } from '@/services/workspaces/companion';
import { CompanionWindow } from '@/components/layout/CompanionWindow';
import { changeLanguage } from '@/i18n/config';

class FakeChannel {
  static instances: FakeChannel[] = [];
  messages: unknown[] = []; closed = false; onmessage: ((event: { data: any }) => void) | null = null;
  constructor(public name: string) { FakeChannel.instances.push(this); }
  postMessage(message: unknown) { this.messages.push(message); }
  close() { this.closed = true; }
  receive(data: unknown) { this.onmessage?.({ data }); }
}
const initial = useAppStore.getState();
let root: Root | undefined, container: HTMLDivElement;
beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await changeLanguage('en'); useAppStore.setState(initial, true); useAppStore.getState().addDocument({ id: 'primary', fileName: 'Live project' });
  FakeChannel.instances = []; vi.stubGlobal('BroadcastChannel', FakeChannel);
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount()); root = undefined; container?.remove();
  for (const channel of FakeChannel.instances) if (!channel.closed) channel.receive({ type: 'bye' });
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});
describe('read-only second screen', () => {
  it('opens once, sends live snapshots after a handshake and rejects remote edits', async () => {
    const focus = vi.fn(), open = vi.spyOn(window, 'open').mockReturnValue({ closed: false, focus } as unknown as Window);
    await openCompanionWindow(); const channel = FakeChannel.instances[0];
    expect(open).toHaveBeenCalledOnce(); expect(String(open.mock.calls[0][0])).toContain('companion=');
    channel.receive({ type: 'ready' });
    expect(channel.messages).toContainEqual(expect.objectContaining({ type: 'snapshot', snapshot: expect.objectContaining({ documentId: 'primary', name: 'Live project' }) }));
    const original = useAppStore.getState().items;
    channel.receive({ type: 'snapshot', snapshot: { items: [{ description: 'Remote overwrite' }] } });
    channel.receive({ type: 'update', field: 'items', value: [] });
    expect(useAppStore.getState().items).toBe(original);
    await openCompanionWindow(); expect(open).toHaveBeenCalledOnce(); expect(focus).toHaveBeenCalledOnce();
    useAppStore.getState().addChapter(null);
    await vi.waitFor(() => expect(channel.messages.length).toBeGreaterThan(1));
    channel.receive({ type: 'bye' }); expect(channel.closed).toBe(true);
  });
  it('reports a blocked browser window without retaining its subscription/channel', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    await expect(openCompanionWindow()).rejects.toThrow('Allow');
    expect(FakeChannel.instances[0].closed).toBe(true);
  });
  it('renders PDF view-only controls and identifies disconnection without editing the document', async () => {
    container = document.createElement('div'); document.body.append(container); root = createRoot(container);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ clearRect: vi.fn() } as unknown as CanvasRenderingContext2D);
    await act(async () => root!.render(<CompanionWindow id="read-only-test" />));
    const channel = FakeChannel.instances[0], state = useAppStore.getState();
    await act(async () => channel.receive({ type: 'snapshot', snapshot: { documentId: 'primary', name: 'Live project', items: state.items, schedule: state.schedule, subSheets: [], activeItemId: null, locale: 'en', theme: 'light' } }));
    expect(container.textContent).toContain('Read-only'); expect(container.textContent).toContain('Connected');
    const labels = [...container.querySelectorAll('button')].map(button => button.textContent);
    expect(labels).not.toContain('Add PDF'); expect(labels).not.toContain('Finish measurement'); expect(labels).not.toContain('Remove');
    expect(useAppStore.getState().documents[0].isModified).toBe(false);
  });
});
