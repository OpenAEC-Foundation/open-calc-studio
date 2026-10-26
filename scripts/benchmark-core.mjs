import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { cpus, platform, arch } from 'node:os';
import { performance } from 'node:perf_hooks';
import { calculateProject, getStaartBreakdown } from '../packages/embed/dist/core.js';
const fixture = readFileSync('public/data/voorbeeld.ifcCalc', 'utf8');
const project = JSON.parse(fixture), iterations = 100;
const edited = structuredClone(project);
const row = edited.items.find(item => item.rowType === 'regel'); row.quantity = 42; row.normUnitPrice = 17.5;
function size(path) {
  if (!existsSync(path)) return null;
  return statSync(path).isDirectory() ? readdirSync(path).reduce((sum, name) => sum + (size(path + '/' + name) ?? 0), 0) : statSync(path).size;
}
const cases = [project, edited].map((input, index) => {
  for (let i = 0; i < 20; i++) calculateProject(input);
  const times = [];
  for (let i = 0; i < iterations; i++) { const start = performance.now(); calculateProject(input); times.push(performance.now() - start); }
  times.sort((a, b) => a - b);
  return { name: index ? 'edited-cost-build-up' : 'native-sample', items: input.items.length,
    medianMs: times[Math.floor(times.length / 2)], p95Ms: times[Math.floor(times.length * .95)],
    totals: getStaartBreakdown(calculateProject(input).items) };
});
const result = { measuredAt: new Date().toISOString(), productVersion: JSON.parse(readFileSync('package.json')).version,
  runtime: process.version, platform: platform(), arch: arch(), cpu: cpus()[0].model, iterations,
  fixture: { path: 'public/data/voorbeeld.ifcCalc', sha256: createHash('sha256').update(fixture).digest('hex') },
  scope: 'Warm synchronous calculation only; RSS is the Node process, not desktop startup or UI latency.',
  rssBytes: process.memoryUsage().rss,
  uncompressedBytes: { web: size('dist'), platform: size('dist-platform'), embed: size('packages/embed/dist'), api: size('dist-server') }, cases };
const output = JSON.stringify(result, null, 2) + '\n';
if (process.argv[2]) writeFileSync(process.argv[2], output); else console.log(output);
