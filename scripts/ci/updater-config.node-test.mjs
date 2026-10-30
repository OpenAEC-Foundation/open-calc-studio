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
