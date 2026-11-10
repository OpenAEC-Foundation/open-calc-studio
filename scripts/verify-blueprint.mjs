import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const base = new URL('../src/styles/blueprint/', import.meta.url);
const source = JSON.parse(readFileSync(new URL('SOURCE.json', base), 'utf8'));
// Hashes are of the upstream LF files; a Windows checkout (core.autocrlf) has CRLF text files.
const isText = file => /\.(css|txt|json|md)$/i.test(file) || !/\.[^/]+$/.test(file);
for (const [file, expected] of Object.entries(source.files)) {
  const bytes = readFileSync(new URL(file, base));
  const content = isText(file) ? Buffer.from(bytes.toString('latin1').replace(/\r\n/g, '\n'), 'latin1') : bytes;
  const actual = createHash('sha256').update(content).digest('hex');
  if (actual !== expected) throw new Error(`Blueprint drift: ${file}. Update the pinned source and provenance together.`);
}
console.log(`Blueprint ${source.commit}, design ${source.designVersion}: ${Object.keys(source.files).length} source files verified.`);
