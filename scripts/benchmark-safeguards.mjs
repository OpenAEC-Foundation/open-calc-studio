import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
mkdirSync('node_modules/.cache', { recursive: true });
const output = 'node_modules/.cache/ocs-safeguards-benchmark.mjs';
await build({ entryPoints: ['research/readiness/benchmark.ts'], bundle: true, format: 'esm', platform: 'node', target: 'node24', outfile: output, external: ['@ifc-lite/parser', 'i18next'] });
const result = spawnSync(process.execPath, ['--expose-gc', output, process.argv[2] ?? '/tmp/ocs-safeguards-performance.json'], { stdio: 'inherit' });
process.exit(result.status ?? 1);
