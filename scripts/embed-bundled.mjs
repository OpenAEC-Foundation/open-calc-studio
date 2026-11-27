// Gedeeld door vite.lib.config.ts en scripts/embed-sync.mjs (knownbug 254).
//
// Deze runtime-afhankelijkheden neemt de lib-build op in de bundel in plaats van ze
// extern te laten: xlsx is een vendored tarball, mdb-reader en zijn Node-polyfills
// (events, stream-browserify) worden via build/browserAliases.ts ingebakken. Een
// gastsite hoeft ze dus niet te installeren; ze horen niet in packages/embed/package.json.
export const EMBED_BUNDLED = ['xlsx', 'mdb-reader', 'events', 'stream-browserify'];

/** React/ReactDOM zijn peer-afhankelijkheden van het embed-pakket. */
export const EMBED_PEERS = ['react', 'react-dom'];

/** De dependencies van packages/embed/package.json, afgeleid van die van de app. */
export function embedDependencies(rootDependencies) {
  return Object.fromEntries(
    Object.entries(rootDependencies)
      .filter(([name]) => !EMBED_PEERS.includes(name) && !EMBED_BUNDLED.includes(name) && !name.startsWith('@types/'))
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}
