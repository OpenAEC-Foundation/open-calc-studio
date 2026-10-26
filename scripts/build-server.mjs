import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { copyNotices, thirdPartyNotices, buildInfo } from './distribution-notices.mjs';
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const result = await build({ entryPoints: { server: 'server/main.mjs', worker: 'server/worker.mjs' }, bundle: true, platform: 'node', target: 'node22', format: 'esm', metafile: true,
  outdir: 'dist-server', outExtension: { '.js': '.mjs' }, define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
});
copyNotices('dist-server');
writeFileSync('dist-server/THIRD-PARTY-NOTICES.txt', thirdPartyNotices(Object.keys(result.metafile.inputs)));
writeFileSync('dist-server/build-info.json', JSON.stringify(buildInfo('headless-api'), null, 2) + '\n');
console.log(`Headless API ${pkg.version}: dist-server/server.mjs`);
