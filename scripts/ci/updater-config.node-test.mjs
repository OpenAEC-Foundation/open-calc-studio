import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkUpdaterConfig } from './check-updater-config.mjs';
const config = JSON.parse(readFileSync(new URL('../../src-tauri/tauri.conf.json', import.meta.url)));
test('the actual Tauri configuration has its matching existing public updater key', () => {
  assert.equal(config.bundle.createUpdaterArtifacts, true);
  checkUpdaterConfig(config, config.plugins.updater.pubkey);
});
test('rejects the missing plugin configuration that broke signed bundling', () => {
  const invalid = structuredClone(config); delete invalid.plugins;
  assert.throws(() => checkUpdaterConfig(invalid), /plugins.updater.pubkey/);
});
test('rejects malformed or mismatched public keys', () => {
  const invalid = structuredClone(config); invalid.plugins.updater.pubkey = 'not a key';
  assert.throws(() => checkUpdaterConfig(invalid), /Invalid minisign/);
  assert.throws(() => checkUpdaterConfig(config, 'a different repository variable'), /differs/);
});
test('does not require a production key when development updater artifacts are explicitly disabled', () => {
  checkUpdaterConfig({ bundle: { createUpdaterArtifacts: false } });
});

test('macOS CI explicitly builds the app bundle needed for updater signing', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/desktop-builds.yml', import.meta.url), 'utf8');
  const args = workflow.match(/args: ([^\n]*--target universal-apple-darwin[^\n]*)/)?.[1];
  assert.ok(args, 'macOS build arguments must exist');
  const bundles = args.match(/--bundles ([^ ]+)/)?.[1].split(',') ?? [];
  assert.ok(bundles.includes('app'), 'DMG alone does not generate a signed updater archive');
  assert.ok(bundles.includes('dmg'), 'the normal macOS installer must remain available');
});
