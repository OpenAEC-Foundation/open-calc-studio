import { mkdir, readdir, readFile, copyFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const formats = {
  'x86_64-pc-windows-msvc': { nsis: '.exe', msi: '.msi' },
  'universal-apple-darwin': { dmg: '.dmg' },
  'x86_64-unknown-linux-gnu': { appimage: '.AppImage', deb: '.deb', rpm: '.rpm' },
};
const target = process.env.BUILD_TARGET;
if (!formats[target]) throw new Error(`Unsupported build target: ${target}`);
const output = 'release-artifacts';
await mkdir(output, { recursive: true });
const checksums = [];
for (const [folder, extension] of Object.entries(formats[target])) {
  const source = path.join('src-tauri', 'target', target, 'release', 'bundle', folder);
  const files = (await readdir(source)).filter(name => name.endsWith(extension)).sort();
  if (files.length !== 1) throw new Error(`Expected one ${extension} installer in ${source}, found ${files.length}`);
  for (const name of files) {
    const from = path.join(source, name);
    const hash = createHash('sha256').update(await readFile(from)).digest('hex');
    await copyFile(from, path.join(output, name));
    checksums.push(`${hash}  ${name}`);
  }
}
await writeFile(path.join(output, 'SHA256SUMS.txt'), checksums.join('\n') + '\n');
console.log(`Collected ${checksums.length} installers for ${target}`);
