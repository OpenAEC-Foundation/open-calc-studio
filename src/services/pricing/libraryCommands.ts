import { useAppStore } from '@/state/appStore';
import { COUNTRY_CODES } from '@/utils/countries';
import { loadOwnLibraries, listOwnLibraries, ownLibrariesLoaded, ownLibraryLoadError, getOwnLibrary, saveOwnLibrary, removeOwnLibrary, renameOwnLibrary } from './ownLibraries';
import { prepareOwnLibrary, type LibraryColumnMapping } from './ownLibraryImport';
import { activeLibrariesOf, ENGLISH_LIBRARY, libraryOfCountry, priceCountryOf, PRICE_LIBRARY_COUNTRIES, ownLibraryKey } from './priceLibraries';
import { choosePriceCountry, setActiveLibraries, toggleLibrary } from './choosePriceCountry';

/** Same persistent library operations as the UI, exposed through app_command / calc_run_action. */
export async function libraryCommand(action: string, params: Record<string, unknown>) {
  const allowed: Record<string, string[]> = {
    list: [], import: ['fileName', 'content', 'dataBase64', 'columnMapping', 'updateId', 'replace'],
    select: ['keys', 'country'], rename: ['id', 'name'], remove: ['id'],
  };
  if (!Object.prototype.hasOwnProperty.call(allowed, action) || Object.keys(params).some(k => !allowed[action].includes(k))) throw Error('Unknown library action or parameter.');
  if (!ownLibrariesLoaded() || ownLibraryLoadError() !== null) await loadOwnLibraries();
  if (ownLibraryLoadError() !== null) throw Error('Own library storage could not be read.');
  const state = useAppStore.getState();
  if (action === 'list') {
    const country = priceCountryOf(state.schedule);
    // countryLibrary INT: the English library (English names, no prices), chosen or because the country has none.
    return { country, countryLibrary: libraryOfCountry(country), builtInCountries: PRICE_LIBRARY_COUNTRIES, active: activeLibrariesOf(state.schedule), libraries: listOwnLibraries() };
  }
  if (action === 'import') {
    if (typeof params.fileName !== 'string' || params.fileName.length === 0) throw Error('fileName is required.');
    if ((params.content !== undefined && typeof params.content !== 'string') || (params.dataBase64 !== undefined && typeof params.dataBase64 !== 'string')) throw Error('File content must be a string.');
    if ((typeof params.content === 'string') === (typeof params.dataBase64 === 'string')) throw Error('Provide either content (text) or dataBase64 (Excel).');
    if (params.updateId !== undefined && typeof params.updateId !== 'string') throw Error('updateId must be a string.');
    if (params.replace !== undefined && typeof params.replace !== 'boolean') throw Error('replace must be a boolean.');
    if (params.columnMapping !== undefined && (!Array.isArray(params.columnMapping) || params.columnMapping.some(f => typeof f !== 'string'))) throw Error('columnMapping must be an array of field names.');
    const text = (params.content ?? params.dataBase64) as string;
    if (text.length > 64 * 1024 * 1024) throw Error('Library file is too large.');
    const content = typeof params.content === 'string' ? params.content : Uint8Array.from(atob(text), c => c.charCodeAt(0));
    const prepared = prepareOwnLibrary(params.fileName, content, { updateId: params.updateId as string | undefined, columnMapping: params.columnMapping as LibraryColumnMapping | undefined });
    if (prepared.replaces && params.replace !== true) throw Error('Library already exists. Review the update, then explicitly pass replace: true.');
    await saveOwnLibrary(prepared.library);
    return { library: listOwnLibraries().find(l => l.id === prepared.library.id), dropped: prepared.dropped, duplicates: prepared.duplicates, warnings: prepared.warnings };
  }
  if (action === 'select') {
    if (!state.activeDocumentId) throw Error('Open an estimate first.');
    if (params.country !== undefined && (typeof params.country !== 'string' || ![...COUNTRY_CODES, ENGLISH_LIBRARY].includes(params.country.toUpperCase()))) throw Error('Unknown country code (ISO 3166-1 alpha-2, or INT for the English library).');
    const known = new Set(['country', ...listOwnLibraries().map(l => ownLibraryKey(l.id))]);
    if (params.keys !== undefined && (!Array.isArray(params.keys) || params.keys.some(k => typeof k !== 'string' || !known.has(k)))) throw Error('keys must contain loaded library keys (country or own:<id>).');
    if (params.country !== undefined) choosePriceCountry((params.country as string).toUpperCase());
    if (params.keys !== undefined) setActiveLibraries(params.keys as string[]);
    return { country: priceCountryOf(useAppStore.getState().schedule), active: activeLibrariesOf(useAppStore.getState().schedule) };
  }
  if (typeof params.id !== 'string' || !getOwnLibrary(params.id)) throw Error('Unknown own library id.');
  if (action === 'rename') {
    if (typeof params.name !== 'string' || params.name.trim() === '') throw Error('name is required.');
    await renameOwnLibrary(params.id, params.name);
    return { renamed: true };
  }
  await removeOwnLibrary(params.id);
  if (state.activeDocumentId) toggleLibrary(ownLibraryKey(params.id), false);
  return { removed: true };
}
