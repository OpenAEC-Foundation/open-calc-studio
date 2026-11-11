/**
 * Bestandsnaam voor uitgebrachte assets: `.mjs` wordt `.js`.
 *
 * De PDF.js-worker (`pdf.worker.min.mjs?url`) wordt als losse asset
 * uitgebracht en als modulescript geladen. Webservers zonder `.mjs` in hun
 * MIME-tabel (zoals een standaard nginx) sturen die mee als
 * `application/octet-stream`, en dan weigert de browser het script:
 * "Setting up fake worker failed" en PDF's laden niet (issue #80).
 * `.js` kent elke server als JavaScript.
 */
export function assetFileName(info: { names?: readonly string[]; name?: string }): string {
  const names = info.names?.length ? info.names : info.name ? [info.name] : [];
  return names.some(name => name.endsWith('.mjs')) ? 'assets/[name]-[hash].js' : 'assets/[name]-[hash][extname]';
}
