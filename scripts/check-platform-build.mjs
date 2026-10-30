import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
const [directory = 'dist-platform', base = '/assets/open_aec/open-calc-studio/'] = process.argv.slice(2);
const html = readFileSync(path.join(directory, 'index.html'), 'utf8');
assert.ok(html.includes(base + 'assets/'), 'Entry modules must use the configured subpath.');
assert.ok(!/(?:src|href)=["']https?:\/\//i.test(html), 'No external startup resources.');
const manifest = JSON.parse(readFileSync(path.join(directory, '.vite/manifest.json'), 'utf8'));
assert.ok(manifest['index.html']?.isEntry);
for (const entry of Object.values(manifest)) {
  for (const asset of [entry.file, ...entry.css ?? [], ...entry.assets ?? []]) assert.ok(existsSync(path.join(directory, asset)), `Missing ${asset}`);
}
for (const asset of ['THIRD-PARTY-NOTICES.txt', 'build-info.json', 'licenses/LICENSE', 'licenses/blueprint/SOURCE.json']) assert.ok(existsSync(path.join(directory, asset)), `Missing ${asset}`);
console.log('Hosted manifest, subpath and distribution notices are complete.');
