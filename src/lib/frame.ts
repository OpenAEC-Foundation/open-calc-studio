// Each document runs this entry in its own JavaScript realm.
import { mount, useOpenCalcStore, openImportResult } from './index';
import type { MountedOpenCalcStudio } from './index';
const protocol = 'open-calc-studio/v1';
let channel = '';
let parentOrigin = '';
let instance: MountedOpenCalcStudio | undefined;
const send = (type: string, payload?: unknown, id?: number, error?: string) => {
  window.parent.postMessage({ protocol, channel, type, payload, id, error }, parentOrigin);
};
window.addEventListener('message', async (event) => {
  if (event.source !== window.parent || !/^https?:\/\//.test(event.origin)) return;
  const message = event.data;
  if (!message || message.protocol !== protocol || typeof message.channel !== 'string') return;
  if (channel && (message.channel !== channel || event.origin !== parentOrigin)) return;
  try {
    if (message.type === 'init' && !instance) {
      channel = message.channel; parentOrigin = event.origin;
      let ready = false;
      const finish = () => { if (!ready) { ready = true; send('ready'); unsubscribe(); } };
      // Register before mount so initial project loading is observable.
      const unsubscribe = useOpenCalcStore.subscribe(s => {
        if (s.documents.length) queueMicrotask(finish);
      });
      instance = mount(document.getElementById('studio')!, {
        ...message.payload,
        onChange(project, json) { send('change', { project, json }); },
        onError(error) { unsubscribe(); send('error', error.message); },
      });
      if (!message.payload?.project && !message.payload?.sample) requestAnimationFrame(finish);
    } else if (message.type === 'update' && instance) {
      instance.update(message.payload ?? {});
      // React commits before the next frame; asynchronous file errors use onError.
      requestAnimationFrame(() => send('reply', null, message.id));
    } else if (message.type === 'import' && instance) {
      const { importBudget } = await import('./importers');
      const result = await importBudget(message.payload.data, message.payload.fileName);
      openImportResult(result, message.payload.fileName);
      send('reply', null, message.id);
    } else if (message.type === 'export' && instance) {
      send('reply', instance.getProjectJson(), message.id);
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (message.type === 'init') send('error', reason);
    else send('reply', null, message.id, reason);
  }
});
