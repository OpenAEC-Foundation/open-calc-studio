import { build } from 'esbuild';

/**
 * Bundelt de MCP-server tot één zelfstandig ESM-bestand (dist/ocs-mcp.mjs).
 *
 * De banner regelt twee dingen die een kale `esbuild ... --format=esm` mist:
 *  1. de shebang als éérste regel, zodat de bundle als CLI uitvoerbaar is;
 *  2. een createRequire-shim. `xlsx` (en enkele andere deps) zijn CommonJS en
 *     doen interne `require()`-calls; zonder deze shim gooit esbuild's __require
 *     in een ESM-bundle "Dynamic require of ... is not supported".
 *
 * NB: de shebang staat bewust NIET meer in src/index.ts — anders bewaart esbuild
 * die óók en krijg je een dubbele (ongeldige) shebang op regel 2.
 */
await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'esm',
  outfile: 'dist/ocs-mcp.mjs',
  banner: {
    js: "#!/usr/bin/env node\nimport { createRequire as __ocsCreateRequire } from 'node:module';\nconst require = __ocsCreateRequire(import.meta.url);",
  },
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
