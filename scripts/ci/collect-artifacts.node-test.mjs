import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const script = fileURLToPath(new URL('collect-artifacts.mjs', import.meta.url));

function run(target, files) {
  const root = mkdtempSync(join(tmpdir(), 'ocs-collect-'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '2026.44.5' }));
  for (const [path, content] of Object.entries(files)) {
    const file = join(root, 'src-tauri/target', target, 'release/bundle', path);
    mkdirSync(join(file, '..'), { recursive: true }); writeFileSync(file, content);
  }
  return { root, result: spawnSync(process.execPath, [script], { cwd: root, env: { ...process.env, BUILD_TARGET: target }, encoding: 'utf8' }) };
}
const cases = [
  ['x86_64-pc-windows-msvc', { 'nsis/App-setup.exe': 'exe', 'nsis/App-setup.exe.sig': 'sig', 'msi/App.msi': 'msi', 'msi/App.msi.sig': 'sig' }],
  ['x86_64-unknown-linux-gnu', { 'appimage/App.AppImage': 'app', 'appimage/App.AppImage.sig': 'sig', 'deb/App.deb': 'deb', 'rpm/App.rpm': 'rpm' }],
  ['universal-apple-darwin', { 'dmg/App.dmg': 'dmg', 'macos/App.app.tar.gz': 'archive', 'macos/App.app.tar.gz.sig': 'sig' }],
];
for (const [target, files] of cases) test(`collects actual installers and updater signatures for ${target}`, () => {
  const { root, result } = run(target, files);
  try {
    assert.equal(result.status, 0, result.stderr);
    for (const [path, content] of Object.entries(files)) {
      let name = path.split('/').at(-1);
      if (target === 'universal-apple-darwin' && name.includes('.app.tar.gz')) name = name.replace('.app.tar.gz', '_2026.44.5_universal.app.tar.gz');
      assert.equal(readFileSync(join(root, 'release-artifacts', name), 'utf8'), content);
    }
    const sums = readFileSync(join(root, 'release-artifacts/SHA256SUMS.txt'), 'utf8');
    if (target === 'universal-apple-darwin') assert.ok(sums.includes('App_2026.44.5_universal.app.tar.gz.sig'));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('refuses Linux publication when the updater signature is missing', () => {
  const { root, result } = run(cases[1][0], { 'appimage/App.AppImage': 'app', 'deb/App.deb': 'deb', 'rpm/App.rpm': 'rpm' });
  try { assert.notEqual(result.status, 0); assert.match(result.stderr, /Missing updater signature/); }
  finally { rmSync(root, { recursive: true, force: true }); }
});
test('refuses macOS publication when the delivered updater signature is missing', () => {
  const { root, result } = run(cases[2][0], { 'dmg/App.dmg': 'dmg', 'macos/App.app.tar.gz': 'archive' });
  try { assert.notEqual(result.status, 0); assert.match(result.stderr, /ENOENT/); }
  finally { rmSync(root, { recursive: true, force: true }); }
});
