import { useAppStore } from '@/state/appStore';
import type { CostItem, CostSchedule, SubSheet } from '@/types/costModel';
import { uiText } from '@/i18n/uiText';
import { isEmbedded } from '@/lib/hostRoot';

export interface CompanionSnapshot { documentId: string; name: string; items: CostItem[]; schedule: CostSchedule; subSheets: SubSheet[]; activeItemId: string | null; locale: string; theme: string }
export const companionChannelName = (id: string) => `ocs-companion-${id}`;
let current: { focus: () => Promise<void>; dispose: () => void } | undefined;

/** A view-only second screen. The parent never accepts document mutations. */
export async function openCompanionWindow(): Promise<void> {
  if (isEmbedded()) throw Error(uiText('companion.standalone', 'Open the standalone app to use a second screen.'));
  if (current) { try { await current.focus(); return; } catch { current.dispose(); } }
  if (typeof BroadcastChannel === 'undefined') throw Error(uiText('companion.unsupported', 'This environment cannot synchronize a second screen.'));
  const id = crypto.randomUUID(), channel = new BroadcastChannel(companionChannelName(id));
  let closed = false, ready = false, timer: ReturnType<typeof setTimeout> | undefined;
  const send = () => {
    if (closed || !ready) return;
    const state = useAppStore.getState();
    const snapshot: CompanionSnapshot = { documentId: state.activeDocumentId, name: state.documents.find(doc => doc.id === state.activeDocumentId)?.fileName ?? '', items: state.items, schedule: state.schedule, subSheets: state.subSheets, activeItemId: state.activeItemId, locale: state.settings.locale, theme: state.settings.theme };
    channel.postMessage({ type: 'snapshot', snapshot });
  };
  const unsubscribe = useAppStore.subscribe((state, previous) => {
    if (state.items === previous.items && state.schedule === previous.schedule && state.subSheets === previous.subSheets && state.activeDocumentId === previous.activeDocumentId && state.activeItemId === previous.activeItemId && state.settings === previous.settings) return;
    clearTimeout(timer); timer = setTimeout(send, 200);
  });
  const alive = setInterval(() => { if (!closed) channel.postMessage({ type: 'alive' }); }, 4000);
  const dispose = () => { if (closed) return; closed = true; unsubscribe(); clearInterval(alive); clearTimeout(timer); channel.close(); current = undefined; };
  channel.onmessage = event => { if (event.data?.type === 'ready') { ready = true; send(); } else if (event.data?.type === 'bye') dispose(); };
  const url = new URL(window.location.href); url.search = ''; url.searchParams.set('companion', id); url.hash = '';
  try {
    let focus: () => Promise<void>;
    if ('__TAURI_INTERNALS__' in window) {
      const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
      const view = new WebviewWindow(`window-companion-${id}`, { url: `${url.pathname}${url.search}`, title: uiText('companion.title', 'Open Calc Studio — Second screen'), width: 1100, height: 850, decorations: true });
      await new Promise<void>((resolve, reject) => { void view.once('tauri://created', () => resolve()); void view.once('tauri://error', event => reject(Error(String(event.payload)))); });
      void view.once('tauri://destroyed', dispose);
      focus = async () => { await view.setFocus(); };
    } else {
      const popup = window.open(url.href, `ocs-companion-${id}`, 'popup,width=1100,height=850');
      if (!popup) throw Error(uiText('companion.blocked', 'Allow the second-screen window in your browser and try again.'));
      focus = async () => { if (popup.closed) throw Error('closed'); popup.focus(); };
    }
    current = { focus, dispose };
  } catch (error) { dispose(); throw error; }
}
