import type { StateCreator } from 'zustand';
import { BUILTIN_CODES, type CodeEntry, type CodeScheme } from '@/data/codeLibrary';

/**
 * Coderingsbibliotheek-slice: de ingebouwde STABU/NL-SfB-lijst plus door de
 * gebruiker zelf toegevoegde coderingen. Eigen coderingen worden in
 * localStorage bewaard (klein, app-breed — niet per document) zodat ze de
 * sessie overleven, ook in de Tauri-WebView.
 */

const STORAGE_KEY = 'ocs-custom-codes-v1';

function isCodeEntry(e: unknown): e is CodeEntry {
  return (
    !!e &&
    typeof (e as CodeEntry).code === 'string' &&
    typeof (e as CodeEntry).description === 'string' &&
    ((e as CodeEntry).scheme === 'stabu' || (e as CodeEntry).scheme === 'nlsfb')
  );
}

function loadCustom(): CodeEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter(isCodeEntry) : [];
  } catch {
    return [];
  }
}

function saveCustom(list: CodeEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* opslag niet beschikbaar — coderingen blijven dan alleen voor deze sessie */
  }
}

const keyOf = (e: Pick<CodeEntry, 'scheme' | 'code'>) => `${e.scheme}:${e.code}`;

export interface CodeLibrarySlice {
  /** Door de gebruiker toegevoegde coderingen (bovenop de ingebouwde lijst). */
  customCodes: CodeEntry[];
  /** Voeg een eigen codering toe (of werk een bestaande met dezelfde sleutel bij). */
  addCustomCode: (entry: CodeEntry) => void;
  /** Verwijder een eigen codering. */
  removeCustomCode: (scheme: CodeScheme, code: string) => void;
  /** De volledige lijst (ingebouwd + eigen; eigen overschrijft dezelfde sleutel). */
  getAllCodes: () => CodeEntry[];
}

export const createCodeLibrarySlice: StateCreator<CodeLibrarySlice> = (set, get) => ({
  customCodes: loadCustom(),

  addCustomCode: (entry) =>
    set((s) => {
      const code = entry.code.trim();
      if (!code) return s;
      const clean: CodeEntry = { code, description: entry.description.trim(), scheme: entry.scheme };
      const exists = s.customCodes.some((e) => keyOf(e) === keyOf(clean));
      const next = exists
        ? s.customCodes.map((e) => (keyOf(e) === keyOf(clean) ? clean : e))
        : [...s.customCodes, clean];
      saveCustom(next);
      return { customCodes: next };
    }),

  removeCustomCode: (scheme, code) =>
    set((s) => {
      const next = s.customCodes.filter((e) => !(e.scheme === scheme && e.code === code));
      saveCustom(next);
      return { customCodes: next };
    }),

  getAllCodes: () => {
    const custom = get().customCodes;
    const customKeys = new Set(custom.map(keyOf));
    const builtin = BUILTIN_CODES.filter((e) => !customKeys.has(keyOf(e)));
    return [...builtin, ...custom];
  },
});
