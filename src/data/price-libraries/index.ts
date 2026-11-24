// Built-in price libraries (issue #93). Register a new country here: the key
// is its ISO 3166-1 alpha-2 code, the value the library JSON in the same
// format as NL.json. Never change the `name` (or `id`) of a registered
// library: it is part of every article ID, and saved estimates link their
// prices to those IDs.
import NL from './NL.json';
import EN from './EN.json';

/**
 * Key of the English library (issue #86): not a country, so not an ISO code.
 * It is the default for new estimates in another language than Dutch, and the
 * library of every country without its own.
 */
export const ENGLISH_LIBRARY = 'INT';

export const PRICE_LIBRARY_FILES: Readonly<Record<string, unknown>> = {
  NL,
  [ENGLISH_LIBRARY]: EN,
};
