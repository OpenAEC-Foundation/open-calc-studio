import type { ProjectFile } from '../types/costModel';

export interface IsolatedProps {
  project?: string | Blob | ProjectFile | null;
  fileName?: string;
  lang?: string;
  theme?: string;
  sample?: boolean;
  onChangeDelay?: number;
}
export interface IsolatedOptions extends IsolatedProps {
  /** URL of the packaged frame/index.html, served by your website. */
  src: string;
  title?: string;
  timeout?: number;
  onChange?: (project: ProjectFile, json: string) => void;
  onError?: (error: Error) => void;
}
export interface IsolatedStudio {
  readonly iframe: HTMLIFrameElement;
  readonly ready: Promise<void>;
  update(props: IsolatedProps): Promise<void>;
  getProjectJson(): Promise<string>;
  importBudget(data: ArrayBuffer, fileName: string): Promise<void>;
  unmount(): void;
}
const protocol = 'open-calc-studio/v1';

/** Independent documents, store, language, CSS and keyboard handling per frame. */
export function mountIsolated(host: HTMLElement, options: IsolatedOptions): IsolatedStudio {
  const { src, title = 'Open Calc Studio', timeout = 30000, onChange, onError, ...props } = options;
  const url = new URL(src, host.ownerDocument.baseURI);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Frame URL must use HTTP(S).');
  const win = host.ownerDocument.defaultView!;
  const channel = crypto.randomUUID();
  const iframe = host.ownerDocument.createElement('iframe');
  iframe.title = title;
  iframe.style.cssText = 'width:100%;height:100%;border:0;display:block';
  iframe.src = url.href;
  let disposed = false;
  let initialized = false;
  let sequence = 0;
  const pending = new Map<number, { resolve: (value: any) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  const send = (type: string, payload: unknown, id?: number) => iframe.contentWindow?.postMessage({ protocol, channel, type, payload, id }, url.origin);
  let resolveReady!: () => void;
  let rejectReady!: (e: Error) => void;
  const ready = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  // Mark as handled even when the host only uses callbacks; ready still rejects for awaiters.
  void ready.catch(() => {});
  const startupTimer = setTimeout(() => {
    const error = new Error('Open Calc Studio frame did not initialize in time.');
    rejectReady(error); onError?.(error);
  }, timeout);
  function receive(event: MessageEvent) {
    if (disposed || event.source !== iframe.contentWindow || event.origin !== url.origin) return;
    const message = event.data;
    if (!message || message.protocol !== protocol || message.channel !== channel) return;
    if (message.type === 'ready') {
      initialized = true; clearTimeout(startupTimer); resolveReady();
    } else if (message.type === 'change') {
      onChange?.(message.payload.project, message.payload.json);
    } else if (message.type === 'error') {
      const error = new Error(String(message.payload));
      if (!initialized) { clearTimeout(startupTimer); rejectReady(error); }
      onError?.(error);
    } else if (message.type === 'reply') {
      const request = pending.get(message.id);
      if (!request) return;
      clearTimeout(request.timer); pending.delete(message.id);
      if (message.error) request.reject(new Error(String(message.error)));
      else request.resolve(message.payload);
    }
  }
  win.addEventListener('message', receive);
  const loaded = () => send('init', props);
  iframe.addEventListener('load', loaded);
  host.appendChild(iframe);
  async function request<T>(type: string, payload?: unknown): Promise<T> {
    await ready;
    if (disposed) throw new Error('Open Calc Studio instance has been unmounted.');
    return new Promise<T>((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Open Calc Studio ${type} timed out.`)); }, timeout);
      pending.set(id, { resolve, reject, timer });
      try { send(type, payload, id); } catch (e) {
        clearTimeout(timer); pending.delete(id); reject(e);
      }
    });
  }
  return {
    iframe, ready,
    update: (next) => request<void>('update', next),
    getProjectJson: () => request<string>('export'),
    importBudget: (data, fileName) => request<void>('import', { data, fileName }),
    unmount() {
      if (disposed) return;
      disposed = true;
      clearTimeout(startupTimer);
      const error = new Error('Open Calc Studio instance has been unmounted.');
      rejectReady(error);
      pending.forEach(p => { clearTimeout(p.timer); p.reject(error); });
      pending.clear(); win.removeEventListener('message', receive);
      iframe.removeEventListener('load', loaded); iframe.remove();
    },
  };
}
