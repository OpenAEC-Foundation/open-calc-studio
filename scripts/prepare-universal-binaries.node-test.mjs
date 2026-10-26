import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { prepareUniversalBinaries } from './prepare-universal-binaries.mjs';

test('ordinary platform bundles never invoke Cargo or lipo', () => {
  assert.deepEqual(prepareUniversalBinaries({ target: 'x86_64-pc-windows-msvc', execute: () => assert.fail('unexpected process') }), []);
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'ocs-universal-'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'test-studio' }));
  const metadata = { packages: [{ name: 'test-studio', default_run: 'test-studio', targets: [
    { name: 'test-studio', kind: ['bin'] }, { name: 'gen_pdf', kind: ['bin'] }, { name: 'app_lib', kind: ['lib'] },
  ] }] };
  const inputs = ['x86_64-apple-darwin', 'aarch64-apple-darwin'].map(arch => join(root, 'src-tauri/target', arch, 'release/gen_pdf'));
  for (const path of inputs) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, 'native fixture'); }
  return { root, metadata, inputs, target: 'universal-apple-darwin' };
}
test('combines both architectures for auxiliary bins and verifies them before packaging', () => {
  const config = fixture(), calls = [];
  try {
    const names = prepareUniversalBinaries({ ...config, execute: (command, args) => {
      calls.push([command, args]); if (args[0] === '-create') writeFileSync(args.at(-1), 'universal fixture');
    } });
    assert.deepEqual(names, ['gen_pdf']);
    assert.deepEqual(calls[0][1].slice(0, 3), ['-create', ...config.inputs]);
    assert.deepEqual(calls[1][1].slice(0, 3), ['-verify_arch', 'x86_64', 'arm64']);
    assert.ok(!existsSync(join(config.root, 'src-tauri/target/universal-apple-darwin/release/test-studio')));
  } finally { rmSync(config.root, { recursive: true, force: true }); }
});
test('missing architecture input fails before creating a partial universal package', () => {
  const config = fixture(); rmSync(config.inputs[1]);
  try {
    assert.throws(() => prepareUniversalBinaries({ ...config, execute: () => assert.fail('unexpected process') }), /Missing auxiliary binary/);
    assert.ok(!existsSync(join(config.root, 'src-tauri/target/universal-apple-darwin')));
  } finally { rmSync(config.root, { recursive: true, force: true }); }
});
