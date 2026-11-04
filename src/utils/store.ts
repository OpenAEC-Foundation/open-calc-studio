import { localStore } from '@/utils/browserStorage';
import { getSiteHost } from '@/services/file/siteHost';
/**
 * Persistent key-value store.
 * Uses the settings of a site host or Tauri's store plugin when available, falls back to localStorage in browser.
 */

import type { Store } from '@tauri-apps/plugin-store';

const LS_PREFIX = 'ocs:';

let _store: Store | null = null;
let _failed = false;

async function getStore(): Promise<Store | null> {
  if (_store) return _store;
  if (_failed) return null;
  try {
    const { load } = await import('@tauri-apps/plugin-store');
    _store = await load('settings.json');
    return _store;
  } catch {
    _failed = true;
    return null;
  }
}

export async function storeGet<T>(key: string): Promise<T | null> {
  const hosted = getSiteHost()?.settings;
  if (hosted) {
    try {
      const val = await hosted.get(key);
      if (val !== null && val !== undefined) return val as T;
    } catch { /* fall through to localStorage */ }
  }
  const store = await getStore();
  if (store) {
    try {
      const val = await store.get<T>(key);
      return val ?? null;
    } catch { /* fall through to localStorage */ }
  }
  // localStorage fallback
  try {
    const raw = localStore.getItem(LS_PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export async function storeSet<T>(key: string, value: T): Promise<void> {
  getSiteHost()?.settings?.set(key, value).catch(() => { /* the copy below stays for this session */ });
  const store = await getStore();
  if (store) {
    try { await store.set(key, value); } catch { /* ignore */ }
  }
  // Always mirror to localStorage for synchronous reads (theme flash prevention) and browser fallback
  try { localStore.setItem(LS_PREFIX + key, JSON.stringify(value)); } catch { /* ignore */ }
}

export async function storeDelete(key: string): Promise<void> {
  getSiteHost()?.settings?.delete(key).catch(() => { /* the host keeps the old value */ });
  const store = await getStore();
  if (store) {
    try { await store.delete(key); } catch { /* ignore */ }
  }
  try { localStore.removeItem(LS_PREFIX + key); } catch { /* ignore */ }
}
