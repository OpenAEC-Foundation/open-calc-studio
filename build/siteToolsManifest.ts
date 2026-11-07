import type { Plugin } from 'vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SOURCE = fileURLToPath(new URL('../src/services/mcp/siteAppTools.json', import.meta.url));

/**
 * The platform build ships the definitions of the `calc_*` tools as `mcp-tools.json` next to the bundle, so the
 * SuperCloud can check them without starting the application: the bytes of `siteAppTools.json`, the same definitions
 * as `window.__OPDS_APP__.definitions()`.
 */
export function siteToolsManifest(): Plugin {
  let hosted = false;
  return {
    name: 'ocs-site-tools-manifest',
    apply: 'build',
    configResolved(config) { hosted = config.mode === 'platform'; },
    generateBundle() {
      if (!hosted) return;
      this.emitFile({ type: 'asset', fileName: 'mcp-tools.json', source: readFileSync(SOURCE) });
    },
  };
}
