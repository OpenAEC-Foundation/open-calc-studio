import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '@/state/appStore';
import { openCompanionWindow } from '@/services/workspaces/companion';

// Knownbug 184: het tweede-schermvenster herladen bleef hangen op "Waiting for the main
// window…" (het hoofdvenster sloot zijn kanaal bij 'bye'), en daarna opende de knop een
// tweede venster.
class FakeChannel {
  static instances: FakeChannel[] = [];
  messages: { type: string }[] = []; closed = false; onmessage: ((event: { data: unknown }) => void) | null = null;
  constructor(public name: string) { FakeChannel.instances.push(this); }
  postMessage(message: { type: string }) { if (!this.closed) this.messages.push(message); }
  close() { this.closed = true; }
  receive(data: unknown) { if (!this.closed) this.onmessage?.({ data }); }
}
const initial = useAppStore.getState();
let popup = { closed: false, focus: vi.fn() };
beforeEach(() => {
  useAppStore.setState(initial, true);
  useAppStore.getState().addDocument({ id: 'primary', fileName: 'Live project' });
  FakeChannel.instances = []; vi.stubGlobal('BroadcastChannel', FakeChannel);
  popup = { closed: false, focus: vi.fn() };
});
afterEach(() => { popup.closed = true; vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('second screen reload (knownbug 184)', () => {
  it('serves the reloaded page again and does not open a second window', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
    await openCompanionWindow();
    const channel = FakeChannel.instances[0];
    channel.receive({ type: 'ready' });
    const snapshots = () => channel.messages.filter(m => m.type === 'snapshot').length;
    expect(snapshots()).toBe(1);

    // Herladen: de oude pagina zegt 'bye', de nieuwe pagina 'ready'.
    channel.receive({ type: 'bye' });
    channel.receive({ type: 'ready' });
    expect(channel.closed).toBe(false);
    expect(snapshots()).toBe(2);

    await openCompanionWindow();
    expect(open).toHaveBeenCalledOnce();
    expect(popup.focus).toHaveBeenCalledOnce();
  });

  it('opens a new window once the old one was really closed', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
    await openCompanionWindow();
    const first = FakeChannel.instances[0];
    first.receive({ type: 'ready' });
    first.receive({ type: 'bye' });
    popup.closed = true;
    await openCompanionWindow();
    expect(first.closed).toBe(true);
    expect(open).toHaveBeenCalledTimes(2);
  });
});
