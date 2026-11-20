// Built-in price libraries, one per country (issue #93). Register a new
// country here: the key is its ISO 3166-1 alpha-2 code, the value the library
// JSON in the same format as NL.json. Never change the `name` (or `id`) of a
// registered library: it is part of every article ID, and saved estimates
// link their prices to those IDs.
import NL from './NL.json';

export const PRICE_LIBRARY_FILES: Readonly<Record<string, unknown>> = {
  NL,
};
