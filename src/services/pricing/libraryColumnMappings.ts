import { localStore } from '@/utils/browserStorage';
import { LIBRARY_COLUMN_FIELDS, type LibraryColumnMapping } from './ownLibraryImport';

const KEY = 'ocs-library-column-mappings-v1';
type Saved = { headers: string[]; mapping: LibraryColumnMapping };
function read(): Saved[] {
  try {
    const value: unknown = JSON.parse(localStore.getItem(KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((s): s is Saved => s && Array.isArray(s.headers) && s.headers.every((h: unknown) => typeof h === 'string') && Array.isArray(s.mapping) && s.mapping.length === s.headers.length && s.mapping.every((f: never) => LIBRARY_COLUMN_FIELDS.includes(f))) : [];
  } catch { return []; }
}
export function recalledLibraryMapping(headers: string[]): LibraryColumnMapping | undefined {
  return read().find(s => JSON.stringify(s.headers) === JSON.stringify(headers))?.mapping;
}
export function rememberLibraryMapping(headers: string[], mapping: LibraryColumnMapping): void {
  const key = JSON.stringify(headers);
  const entries = read().filter(s => JSON.stringify(s.headers) !== key);
  // Retain layouts only, never supplier rows/prices, and keep storage bounded.
  localStore.setItem(KEY, JSON.stringify([{ headers, mapping }, ...entries].slice(0, 20)));
}
