import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
/** mdb-reader's browser crypto dependencies use these Node-compatible APIs. */
export const browserAliases = {
  stream: require.resolve('stream-browserify'),
  events: require.resolve('events/'),
};
