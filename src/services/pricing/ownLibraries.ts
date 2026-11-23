// Own price libraries (issue #104): library files the user imported, kept on
// this computer next to the built-in country libraries (#93). Each one is
// stored in the library JSON format (docs/price-library-format.md) with an
// explicit `id`, so its catalogue ID, and with it every article ID and price
// link, survives a rename or a re-import.
//
// Storage: one JSON file in the app-data folder in the desktop app, IndexedDB
// on the web. Both are asynchronous; the libraries are read once with
// `loadOwnLibraries()` and kept in memory, so the rest of the app reads them
// synchronously.
import type { ResourceLibraryItem } from '@/types/costModel';
import { uiText } from '@/i18n/uiText';
import { parseLibraryJson } from './libraryJson';

/** A library in the library JSON format, with its catalogue ID made explicit. */
export interface OwnLibraryJson {
  id: string;
  name: string;
  version: string;
  currency?: string;
  region?: string;
  description?: string;
  resources: unknown[];
}

export type OwnLibraryOrigin = 'json' | 'table' | 'bmecat';

export interface OwnLibrary {
  /** Catalogue ID: part of every article ID, so price links depend on it. Never changes after the first import. */
  id: string;
  name: string;
  version: string;
  currency?: string;
  region?: string;
  origin: OwnLibraryOrigin;
  /** Number of resources. */
  count: number;
  /** Name of the file it was last imported from. */
  fileName: string;
  /** ISO time of the last import. */
  importedAt: string;
  library: OwnLibraryJson;
}

/** What the rest of the app sees: everything but the resources themselves. */
export type OwnLibraryInfo = Omit<OwnLibrary, 'library'>;

/** Where the libraries are kept. `saveAll` throws when they cannot be stored. */
export interface OwnLibraryBackend {
  loadAll(): Promise<unknown>;
  saveAll(libraries: OwnLibrary[]): Promise<void>;
}

const STORE_VERSION = 1;

// ── Backends ────────────────────────────────────────────────────────────────

/** Desktop app: `<app data>/price-libraries.json`, a file the user can back up. */
export function tauriFileBackend(): OwnLibraryBackend {
  const file = async () => {
    const { appDataDir, join } = await import('@tauri-apps/api/path');
    const dir = await appDataDir();
    return { dir, path: await join(dir, 'price-libraries.json') };
  };
  return {
    async loadAll() {
      const { exists, readTextFile } = await import('@tauri-apps/plugin-fs');
      const { path } = await file();
      if (!(await exists(path))) return [];
      return JSON.parse(await readTextFile(path));
    },
    async saveAll(libraries) {
      const { mkdir, writeTextFile } = await import('@tauri-apps/plugin-fs');
      const { dir, path } = await file();
      try { await mkdir(dir, { recursive: true }); } catch { /* exists */ }
      await writeTextFile(path, JSON.stringify({ version: STORE_VERSION, libraries }));
    },
  };
}

const IDB_NAME = 'ocs-price-libraries';
const IDB_STORE = 'libraries';

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(Error('IndexedDB is not available.')); return; }
    const request = indexedDB.open(IDB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(IDB_STORE, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Web: IndexedDB, one record per library (no 5 MB limit like localStorage). */
export function indexedDbBackend(): OwnLibraryBackend {
  return {
    async loadAll() {
      const db = await openIdb();
      try {
        return await new Promise<unknown>((resolve, reject) => {
          const request = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).getAll();
          request.onsuccess = () => resolve({ version: STORE_VERSION, libraries: request.result });
          request.onerror = () => reject(request.error);
        });
      } finally { db.close(); }
    },
    async saveAll(libraries) {
      const db = await openIdb();
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(IDB_STORE, 'readwrite');
          const store = tx.objectStore(IDB_STORE);
          store.clear();
          for (const library of libraries) store.put(library);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error ?? Error('Aborted.'));
        });
      } finally { db.close(); }
    },
  };
}

/** Tests, and a last resort when nothing else is available: kept until the app closes. */
export function memoryBackend(initial: OwnLibrary[] = []): OwnLibraryBackend & { stored: OwnLibrary[] } {
  const backend = {
    stored: structuredClone(initial),
    async loadAll() { return { version: STORE_VERSION, libraries: structuredClone(backend.stored) }; },
    async saveAll(libraries: OwnLibrary[]) { backend.stored = structuredClone(libraries); },
  };
  return backend;
}

function defaultBackend(): OwnLibraryBackend {
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) return tauriFileBackend();
  if (typeof indexedDB !== 'undefined') return indexedDbBackend();
  return memoryBackend();
}

// ── In-memory state ─────────────────────────────────────────────────────────

let backend: OwnLibraryBackend | null = null;
let libraries: OwnLibrary[] = [];
let infoSnapshot: OwnLibraryInfo[] = [];
let loading: Promise<void> | null = null;
let loadError: string | null = null;
let loaded = false;
/** Writes run one after another, so two quick changes never overwrite each other. */
let writes: Promise<unknown> = Promise.resolve();
const parsedItems = new Map<string, ResourceLibraryItem[]>();
/** Every own library ID seen this session, also removed ones: their articles must leave the store too. */
const seenIds = new Set<string>();
const listeners = new Set<() => void>();

function isOwnLibrary(value: unknown): value is OwnLibrary {
  const v = value as OwnLibrary;
  return !!v && typeof v === 'object' && typeof v.id === 'string' && v.id !== '' && typeof v.name === 'string'
    && !!v.library && typeof v.library === 'object' && v.library.id === v.id && Array.isArray(v.library.resources);
}

function publish(next: OwnLibrary[]): void {
  libraries = next;
  for (const library of next) seenIds.add(library.id);
  infoSnapshot = next.map(({ library: _library, ...info }) => info);
  parsedItems.clear();
  listeners.forEach(listener => listener());
}

/** Use another storage (tests). Clears what is in memory; call `loadOwnLibraries()` next. */
export function setOwnLibraryBackend(next: OwnLibraryBackend | null): void {
  backend = next;
  loading = null;
  loadError = null;
  loaded = false;
  seenIds.clear();
  writes = Promise.resolve();
  publish([]);
}

/**
 * Read the stored libraries once. Later calls return the same promise. A
 * damaged store never stops the app: the libraries are then unavailable and
 * `ownLibraryLoadError()` says why, and nothing is written over the store.
 */
export function loadOwnLibraries(): Promise<void> {
  backend ??= defaultBackend();
  const from = backend;
  loading ??= from.loadAll().then(data => {
    if (from !== backend) return;
    const list = Array.isArray(data) ? data : (data as { libraries?: unknown })?.libraries;
    if (!Array.isArray(list)) throw Error('Unknown format.');
    loaded = true;
    publish(list.filter(isOwnLibrary));
  }).catch(e => {
    if (from !== backend) return;
    loadError = e instanceof Error ? e.message : String(e);
    loaded = true;
    console.warn('[Own price libraries] could not read the stored libraries:', e);
    listeners.forEach(listener => listener());
  });
  return loading;
}

export function ownLibraryLoadError(): string | null {
  return loadError;
}

/** All own libraries on this computer, in import order. Stable between changes (for useSyncExternalStore). */
export function listOwnLibraries(): OwnLibraryInfo[] {
  return infoSnapshot;
}

export function getOwnLibrary(id: string): OwnLibraryInfo | undefined {
  return infoSnapshot.find(library => library.id === id);
}

export function isOwnLibraryId(id: string | undefined): boolean {
  return id !== undefined && libraries.some(library => library.id === id);
}

/** True for an own library that is on this computer or was during this session (removed since). */
export function wasOwnLibraryId(id: string | undefined): boolean {
  return id !== undefined && seenIds.has(id);
}

/** False until the stored libraries were read (or failed to). */
export function ownLibrariesLoaded(): boolean {
  return loaded;
}

/** The library file of an own library (to export or share it). */
export function ownLibraryJson(id: string): OwnLibraryJson | undefined {
  const library = libraries.find(l => l.id === id)?.library;
  return library ? structuredClone(library) : undefined;
}

/** The articles of an own library, or null when it is not on this computer. Copies, like the built-in libraries. */
export function ownLibraryItems(id: string): ResourceLibraryItem[] | null {
  const library = libraries.find(l => l.id === id);
  if (!library) return null;
  let items = parsedItems.get(id);
  if (!items) {
    try {
      items = parseLibraryJson(library.library);
    } catch (e) {
      console.warn(`[Own price libraries] library ${id} could not be read:`, e);
      items = [];
    }
    parsedItems.set(id, items);
  }
  return items.map(item => ({ ...item }));
}

/** Apply a change to the current list after earlier writes finished, store it, then show it. */
function persist(change: (current: OwnLibrary[]) => OwnLibrary[]): Promise<void> {
  const run = writes.then(() => loadOwnLibraries()).then(async () => {
    if (loadError !== null) {
      throw Error(uiText('pricing.ownStoreUnreadable', 'The own libraries on this computer could not be read ({{error}}), so nothing is saved, to keep them from being overwritten.', { error: loadError }));
    }
    const next = change(libraries);
    try {
      await (backend ??= defaultBackend()).saveAll(next);
    } catch (e) {
      throw Error(uiText('pricing.ownStorageFailed', 'The library could not be saved on this computer: {{error}}', { error: e instanceof Error ? e.message : String(e) }));
    }
    publish(next);
  });
  writes = run.catch(() => undefined);
  return run;
}

/** Add an own library, or replace the one with the same ID in its place (a newer version keeps its price links). */
export function saveOwnLibrary(library: OwnLibrary): Promise<void> {
  return persist(current => {
    const at = current.findIndex(l => l.id === library.id);
    const next = [...current];
    if (at >= 0) next[at] = library; else next.push(library);
    return next;
  });
}

/** Change the name shown to the user. The catalogue ID, and so every price link, stays the same. */
export async function renameOwnLibrary(id: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (trimmed === '') return;
  await persist(current => current.map(l => (l.id === id ? { ...l, name: trimmed, library: { ...l.library, name: trimmed } } : l)));
}

export function removeOwnLibrary(id: string): Promise<void> {
  return persist(current => current.filter(l => l.id !== id));
}

export function subscribeOwnLibraries(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
