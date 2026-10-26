import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const base = new URL('../src/styles/blueprint/', import.meta.url);
const source = JSON.parse(readFileSync(new URL('SOURCE.json', base), 'utf8'));
for (const [file, expected] of Object.entries(source.files)) {
  const actual = createHash('sha256').update(readFileSync(new URL(file, base))).digest('hex');
  if (actual !== expected) throw new Error(`Blueprint drift: ${file}. Update the pinned source and provenance together.`);
}
console.log(`Blueprint ${source.commit}, design ${source.designVersion}: ${Object.keys(source.files).length} source files verified.`);
