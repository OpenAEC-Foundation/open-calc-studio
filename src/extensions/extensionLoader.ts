/**
 * Extension loader — discovers, loads, enables, and disables extensions.
 *
 * Browser mode: extensions are installed via ZIP upload or catalog download.
 * Extensions are stored in IndexedDB and loaded from there.
 *
 * Tauri mode: extensions are stored on the filesystem under appDataDir/extensions/.
 */
import type { ExtensionManifest, ExtensionPlugin, InstalledExtension } from './types';
import { createExtensionApi } from './extensionApi';
import { useAppStore } from '../state/appStore';

// Active plugin instances (for cleanup on disable)
const activePlugins = new Map<string, { plugin: ExtensionPlugin; api: ReturnType<typeof createExtensionApi> }>();

/**
 * Get the IndexedDB-based extension storage.
 */
function openExtensionDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('ocs-extensions', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('extensions')) {
        db.createObjectStore('extensions', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

interface StoredExtension {
  id: string;
  manifest: ExtensionManifest;
  mainCode: string;
  enabled: boolean;
}

export async function saveExtensionToDb(ext: StoredExtension): Promise<void> {
  const db = await openExtensionDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('extensions', 'readwrite');
    tx.objectStore('extensions').put(ext);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function removeExtensionFromDb(id: string): Promise<void> {
  const db = await openExtensionDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('extensions', 'readwrite');
    tx.objectStore('extensions').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllExtensionsFromDb(): Promise<StoredExtension[]> {
  const db = await openExtensionDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('extensions', 'readonly');
    const req = tx.objectStore('extensions').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getExtensionFromDb(id: string): Promise<StoredExtension | undefined> {
  const db = await openExtensionDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('extensions', 'readonly');
    const req = tx.objectStore('extensions').get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Execute extension code and return the plugin instance.
 */
function executeExtensionCode(mainCode: string): ExtensionPlugin {
  // Create a sandboxed module environment
  const moduleExports: Record<string, any> = {};
  const moduleObj = { exports: moduleExports };

  // Provide a simple require function for common modules
  const requireFn = (moduleName: string) => {
    if (moduleName === 'open-calc-studio') {
      return (window as any).__openCalcStudioSdk || {};
    }
    throw new Error(`Module "${moduleName}" is not available in extension sandbox`);
  };

  try {
    const fn = new Function('module', 'exports', 'require', mainCode);
    fn(moduleObj, moduleExports, requireFn);
  } catch (err) {
    throw new Error(`Failed to execute extension code: ${err}`);
  }

  const plugin = moduleObj.exports.default || moduleObj.exports;
  if (typeof plugin.onLoad !== 'function') {
    throw new Error('Extension must export an onLoad function');
  }

  return plugin as ExtensionPlugin;
}

/**
 * Enable an extension by loading and running its code.
 */
export async function enableExtension(id: string): Promise<void> {
  const store = useAppStore.getState();

  // Builtins leven in code, niet in IndexedDB: hun importers blijven altijd
  // geregistreerd en alleen de status bepaalt zichtbaarheid. Direct weer op
  // 'enabled' zetten — de DB-route hieronder zou met "not found in storage"
  // falen en de toggle permanent op error zetten.
  if (id.startsWith('builtin-')) {
    store.setExtensionStatus(id, 'enabled');
    return;
  }

  // Already active?
  if (activePlugins.has(id)) return;

  store.setExtensionStatus(id, 'loading');

  try {
    const stored = await getExtensionFromDb(id);
    if (!stored) throw new Error(`Extension "${id}" not found in storage`);

    const plugin = executeExtensionCode(stored.mainCode);
    const api = createExtensionApi(id, stored.manifest.permissions);

    await plugin.onLoad(api);

    activePlugins.set(id, { plugin, api });
    store.setExtensionStatus(id, 'enabled');

    // Persist enabled state
    stored.enabled = true;
    await saveExtensionToDb(stored);
  } catch (err: any) {
    store.setExtensionStatus(id, 'error', err.message || String(err));
    console.error(`[Extensions] Failed to enable "${id}":`, err);
  }
}

/**
 * Disable an extension.
 */
export async function disableExtension(id: string): Promise<void> {
  const active = activePlugins.get(id);
  if (active) {
    try {
      await active.plugin.onUnload?.();
    } catch (err) {
      console.error(`[Extensions] Error in onUnload for "${id}":`, err);
    }
    active.api._cleanup();
    activePlugins.delete(id);
  }

  useAppStore.getState().setExtensionStatus(id, 'disabled');

  // Persist disabled state
  const stored = await getExtensionFromDb(id);
  if (stored) {
    stored.enabled = false;
    await saveExtensionToDb(stored);
  }
}

/**
 * Load all installed extensions from IndexedDB on startup.
 */
export async function loadAllExtensions(): Promise<void> {
  try {
    const allExtensions = await getAllExtensionsFromDb();

    for (const ext of allExtensions) {
      // Builtin-importers (BasCalc/WpCalc/xtb/RSX/…) zijn in-code beheerd en
      // staan standaard AAN via registerBuiltinExtensions(). Een (stale)
      // IndexedDB-record mag die registratie nooit overschrijven naar
      // 'disabled' — anders kun je ineens geen .calc/.xtb meer openen.
      if (ext.id.startsWith('builtin-')) continue;

      // Register in store
      const installed: InstalledExtension = {
        id: ext.id,
        manifest: ext.manifest,
        status: 'disabled',
      };
      useAppStore.getState().registerExtension(installed);

      // Auto-enable if previously enabled
      if (ext.enabled) {
        await enableExtension(ext.id);
      }
    }
  } catch (err) {
    console.error('[Extensions] Failed to load extensions:', err);
  }
}

/**
 * Get map of active plugin instances.
 */
export function getActivePlugins() {
  return activePlugins;
}
