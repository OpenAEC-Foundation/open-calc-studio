import { useAppStore } from '@/state/appStore';
import { serializeDocument } from './documentSnapshot';
import { deserializeProject } from './fileService';
import { openProjectInStore } from './openProject';

export interface RecoveryRecord {
  version: 1; id: string; savedAt: string; activeIndex: number;
  documents: { fileName: string; originalPath: string | null; json: string }[];
}
const DB = 'ocs-project-recovery-v1';
const STORE = 'windows';
let database: Promise<IDBDatabase> | undefined;
let windowId = '';
export function recoveryWindowId(): string { return windowId ||= crypto.randomUUID(); }
/** Set once the user closed the window on purpose; this window must not journal again (knownbugs 263). */
let closedDeliberately = false;
/** Drop this window's journal before a deliberate close (Save or Don't save) and stop journaling, so `pagehide` cannot bring it back. */
export async function discardRecoveryOnClose(): Promise<void> {
  closedDeliberately = true;
  if (!recoveryAvailable()) return;
  try { await removeRecovery(recoveryWindowId()); } catch { /* No storage: nothing to discard. */ }
}
/** Undo `discardRecoveryOnClose` when the window did not close after all. */
export function resumeRecovery(): void { closedDeliberately = false; }
/** An opaque host frame has no browser storage at all: there is nothing to journal to, and the host keeps the files. */
export function recoveryAvailable(): boolean { return typeof window === 'undefined' || window.origin !== 'null'; }
export function openRecoveryDatabase(): Promise<IDBDatabase> {
  if (!database) database = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(Error('Persistent recovery storage is unavailable.')); return; }
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
    request.onsuccess = () => { const db = request.result; db.onversionchange = () => { db.close(); database = undefined; }; resolve(db); };
    request.onerror = () => reject(request.error ?? Error('Could not open recovery storage.'));
    request.onblocked = () => reject(Error('Recovery storage is blocked by another window.'));
  }).catch(error => { database = undefined; throw error; });
  return database;
}
async function transaction<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openRecoveryDatabase();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode), request = operation(tx.objectStore(STORE));
    let value: T;
    request.onsuccess = () => { value = request.result; };
    // Success means transaction commit, never an in-memory fallback.
    tx.oncomplete = () => resolve(value);
    tx.onerror = tx.onabort = () => reject(tx.error ?? request.error ?? Error('Recovery transaction failed.'));
  });
}
export async function listRecovery(): Promise<RecoveryRecord[]> {
  const records = await transaction('readonly', store => store.getAll()) as RecoveryRecord[];
  return records.filter(r => r.version === 1 && Array.isArray(r.documents)).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}
export async function removeRecovery(id: string): Promise<void> {
  await transaction('readwrite', store => store.delete(id));
}
export function captureRecovery(id: string): RecoveryRecord | null {
  if (closedDeliberately && id === windowId) return null;
  const state = useAppStore.getState();
  // Retain all open tabs when any tab has uncommitted work.
  if (!state.documents.some(d => d.isModified)) return null;
  return { version: 1, id, savedAt: new Date().toISOString(), activeIndex: state.documents.findIndex(d => d.id === state.activeDocumentId),
    documents: state.documents.map(doc => ({ fileName: doc.fileName, originalPath: doc.filePath, json: serializeDocument(state, doc) })) };
}
export async function writeRecovery(record: RecoveryRecord): Promise<void> {
  if (record.version !== 1 || !record.documents.length || typeof record.id !== 'string') throw Error('Invalid recovery record.');
  // A write captured before the close was confirmed may still be queued; it must not outlive the discard.
  if (closedDeliberately && record.id === windowId) { await removeRecovery(record.id); return; }
  await transaction('readwrite', store => store.put(record));
}
export function restoreRecovery(record: RecoveryRecord): string[] {
  // Validate the complete set before opening any tabs. Never overwrite originals.
  if (record.version !== 1 || !Array.isArray(record.documents) || !record.documents.length) throw Error('Invalid recovery record.');
  const projects = record.documents.map(doc => {
    if (typeof doc.fileName !== 'string' || typeof doc.json !== 'string') throw Error('Invalid recovery document.');
    return deserializeProject(doc.json);
  });
  const ids = projects.map((project, index) => {
    const id = openProjectInStore(project, record.documents[index].fileName, null);
    useAppStore.getState().updateDocument(id, { isModified: true });
    return id;
  });
  useAppStore.getState().setActiveDocument(ids[record.activeIndex] ?? ids[0]);
  return ids;
}
