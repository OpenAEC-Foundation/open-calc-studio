/**
 * BroadcastChannel-based inter-window communication for dock/undock.
 * Works across same-origin windows (Tauri webviews share the same origin).
 */

export interface DockRequestMessage {
  type: 'dock-request';
  filePath: string;
  windowLabel: string;
}

export interface CloseDetachedMessage {
  type: 'close-detached';
  windowLabel: string;
}

export type WindowBridgeMessage = DockRequestMessage | CloseDetachedMessage;

let channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel {
  if (!channel) {
    channel = new BroadcastChannel('open-calc-studio');
  }
  return channel;
}

/** Send a dock request from a detached window to the main window */
export function sendDockRequest(filePath: string, windowLabel: string): void {
  getChannel().postMessage({
    type: 'dock-request',
    filePath,
    windowLabel,
  } satisfies DockRequestMessage);
}

/** Send a close message to a specific detached window */
export function sendCloseDetached(windowLabel: string): void {
  getChannel().postMessage({
    type: 'close-detached',
    windowLabel,
  } satisfies CloseDetachedMessage);
}

/** Listen for messages on the bridge. Returns a cleanup function. */
export function onWindowBridgeMessage(
  callback: (msg: WindowBridgeMessage) => void
): () => void {
  const ch = getChannel();
  const handler = (e: MessageEvent) => {
    if (e.data?.type) {
      callback(e.data as WindowBridgeMessage);
    }
  };
  ch.addEventListener('message', handler);
  return () => ch.removeEventListener('message', handler);
}
