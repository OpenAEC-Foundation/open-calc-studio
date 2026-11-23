// Built-in price library per country (issue #93). The country is stored per
// estimate in `schedule.priceCountry`; an estimate without one uses the Dutch
// library, as before. A country without a library has no built-in resources:
// never fall back silently to another country's prices.
//
// Issue #104: an estimate can use several libraries at once, in
// `schedule.priceLibraries`: `country` (the library of `priceCountry`) and own
// libraries as `own:<catalogue ID>`. Unset means only the country library, as
// with #93.
import type { CostSchedule, PriceOrigin, ResourceLibraryItem } from '@/types/costModel';
import { PRICE_LIBRARY_FILES } from '@/data/price-libraries';
import { catalogueIdOf, parseLibraryJson } from './libraryJson';
import { isOwnLibraryId, ownLibraryItems, wasOwnLibraryId } from './ownLibraries';

export const DEFAULT_PRICE_COUNTRY = 'NL';

/** Countries that have a built-in library, in registry order. */
export const PRICE_LIBRARY_COUNTRIES: readonly string[] = Object.keys(PRICE_LIBRARY_FILES);

/** Catalogue IDs of all built-in libraries; their articles are swapped when the country changes. */
const BUILT_IN_CATALOGUES = new Set(Object.values(PRICE_LIBRARY_FILES).map(catalogueIdOf));

/** The price-library country of an estimate (upper-case ISO code), NL when unset or invalid. */
export function priceCountryOf(schedule: Pick<CostSchedule, 'priceCountry'> | null | undefined): string {
  const code = schedule?.priceCountry;
  return typeof code === 'string' && /^[a-z]{2}$/i.test(code) ? code.toUpperCase() : DEFAULT_PRICE_COUNTRY;
}

export function hasPriceLibrary(country: string): boolean {
  return Object.prototype.hasOwnProperty.call(PRICE_LIBRARY_FILES, country);
}

const parsed = new Map<string, ResourceLibraryItem[]>();

/** The built-in articles for a country; empty when it has no library. */
export function builtInLibraryItems(country: string): ResourceLibraryItem[] {
  if (!hasPriceLibrary(country)) return [];
  let items = parsed.get(country);
  if (!items) {
    items = parseLibraryJson(PRICE_LIBRARY_FILES[country]);
    parsed.set(country, items);
  }
  // A copy, so edits through the store (MCP update_resource) never reach the cache.
  return items.map(item => ({ ...item }));
}

/** True for the catalogue ID of a built-in country library: an own library never gets one. */
export function isBuiltInCatalogueId(id: string): boolean {
  return BUILT_IN_CATALOGUES.has(id);
}

export function isBuiltInLibraryItem(item: Pick<ResourceLibraryItem, 'catalogueId'>): boolean {
  return item.catalogueId !== undefined && BUILT_IN_CATALOGUES.has(item.catalogueId);
}

/**
 * The library list for another country: the built-in articles of `country`
 * first, then everything the user imported or added, unchanged.
 */
export function withBuiltInLibrary(current: ResourceLibraryItem[], country: string): ResourceLibraryItem[] {
  return [...builtInLibraryItems(country), ...current.filter(item => !isBuiltInLibraryItem(item))];
}

/** Key of the country library in `schedule.priceLibraries`. */
export const COUNTRY_LIBRARY = 'country';
const OWN_PREFIX = 'own:';

export const ownLibraryKey = (id: string): string => OWN_PREFIX + id;

/** The own library ID of a key, or null for the country library. */
export function ownLibraryIdOfKey(key: string): string | null {
  return key.startsWith(OWN_PREFIX) ? key.slice(OWN_PREFIX.length) : null;
}

type LibrarySchedule = Pick<CostSchedule, 'priceCountry' | 'priceLibraries'> | null | undefined;

/** The libraries an estimate uses, in order, without doubles. Unset: only the country library. */
export function activeLibrariesOf(schedule: LibrarySchedule): string[] {
  const list = schedule?.priceLibraries;
  if (!Array.isArray(list)) return [COUNTRY_LIBRARY];
  const keys = list.filter((key): key is string => typeof key === 'string' && (key === COUNTRY_LIBRARY || (key.startsWith(OWN_PREFIX) && key.length > OWN_PREFIX.length)));
  return [...new Set(keys)];
}

/** One string for the library choice of an estimate: changes exactly when its library list must change. */
export function libraryChoiceKeyOf(schedule: LibrarySchedule): string {
  return [priceCountryOf(schedule), ...activeLibrariesOf(schedule)].join('|');
}

/** Own libraries the estimate uses that are not on this computer. */
export function missingOwnLibraries(schedule: LibrarySchedule): string[] {
  return activeLibrariesOf(schedule).map(ownLibraryIdOfKey).filter((id): id is string => id !== null && !isOwnLibraryId(id));
}

/** Articles that come from a library (built-in or own) and are swapped with the choice of the estimate. */
export function isLibraryArticle(item: Pick<ResourceLibraryItem, 'catalogueId'>): boolean {
  return isBuiltInLibraryItem(item) || wasOwnLibraryId(item.catalogueId);
}

/**
 * The library list for an estimate: the articles of its active libraries in
 * order, then everything the user imported or added loose, unchanged. A
 * library that is not on this computer gives no articles; never another
 * library's prices instead.
 */
export function withActiveLibraries(current: ResourceLibraryItem[], schedule: LibrarySchedule): ResourceLibraryItem[] {
  const chosen = activeLibrariesOf(schedule).flatMap(key => {
    const own = ownLibraryIdOfKey(key);
    return own === null ? builtInLibraryItems(priceCountryOf(schedule)) : ownLibraryItems(own) ?? [];
  });
  return [...chosen, ...current.filter(item => !isLibraryArticle(item))];
}

/**
 * True when a row's price came from a library article (`<catalogue>:<article>`)
 * and that library is not in the library list of the estimate: switched off,
 * or not on this computer. The row keeps its price; only price updates need
 * the library. Loose and legacy articles never count as missing.
 */
export function isPriceOriginLibraryMissing(origin: Pick<PriceOrigin, 'itemId' | 'catalogueId'>, library: ResourceLibraryItem[]): boolean {
  if (!origin.itemId.startsWith(`${encodeURIComponent(origin.catalogueId)}:`)) return false;
  return !library.some(item => item.catalogueId === origin.catalogueId);
}
