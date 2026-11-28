import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { enableExtension, saveExtensionToDb } from '@/extensions/extensionLoader';
import { useAppStore } from '@/state/appStore';

// Knownbug 171: een extensie waarvan onLoad een fout gooit, liet haar knoppen en
// event listeners achter; opnieuw inschakelen verdubbelde de listeners.
const code = `
module.exports = {
  onLoad(api) {
    api.ui.addRibbonButton({ tab: 'home', group: 'Test', label: 'Kapotte knop', onClick() {} });
    api.events.on('test:ping', () => { (window.__pings = (window.__pings || 0) + 1); });
    throw new Error('onLoad faalt');
  },
};`;

describe('extension whose onLoad throws (knownbug 171)', () => {
  it('removes the UI and listeners it registered before the error', async () => {
    await saveExtensionToDb({
      id: 'broken-ext', mainCode: code, enabled: true,
      manifest: { id: 'broken-ext', name: 'Broken', version: '1.0.0', minAppVersion: '0', author: 'x', description: '', category: 'Other', main: 'main.js', permissions: ['ribbon', 'events'] },
    });
    useAppStore.getState().registerExtension({ id: 'broken-ext', manifest: { id: 'broken-ext' } as never, status: 'disabled' });
    await enableExtension('broken-ext');
    expect(useAppStore.getState().installedExtensions['broken-ext'].status).toBe('error');
    expect(useAppStore.getState().extensionRibbonButtons.filter(b => b.extensionId === 'broken-ext')).toEqual([]);

    // Opnieuw proberen: er mag geen tweede listener bij komen.
    await enableExtension('broken-ext');
    const w = window as unknown as { __pings?: number; __openCalcStudioEmit?: unknown };
    w.__pings = 0;
    const { createExtensionApi } = await import('@/extensions/extensionApi');
    createExtensionApi('probe', ['events']).events.emit('test:ping');
    expect(w.__pings).toBe(0);
  });
});
