import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { verifyUpdaterAssets } from './verify-updater-assets.mjs';
function fixture(files) {
  const dir = mkdtempSync(join(tmpdir(), 'ocs-verify-assets-'));
  for (const [name, data] of Object.entries(files)) writeFileSync(join(dir, name), data);
  return dir;
}
test('passes the actual archive bytes, signature and key to the external verifier', () => {
  const dir = fixture({ 'App_universal.app.tar.gz': 'archive', 'App_universal.app.tar.gz.sig': 'signature', 'other.txt': 'ignore' });
  let called = 0;
  try {
    const result = verifyUpdaterAssets(dir, 'public-key', (key, signature, bytes) => {
      called++; assert.equal(key, 'public-key'); assert.equal(signature, 'signature'); assert.equal(bytes.toString(), 'archive'); return 'verified comment';
    });
    assert.equal(called, 1); assert.equal(result.verified, true); assert.equal(result.artifacts.length, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('does not report success for a missing signature', () => {
  const dir = fixture({ 'App.AppImage': 'app' });
  try { assert.throws(() => verifyUpdaterAssets(dir, 'key', () => { throw Error('must not be called'); }), /ENOENT/); }
  finally { rmSync(dir, { recursive: true, force: true }); }
});
test('does not swallow cryptographic rejection of changed installer bytes', () => {
  const dir = fixture({ 'App.msi': 'tampered', 'App.msi.sig': 'signature' });
  try { assert.throws(() => verifyUpdaterAssets(dir, 'key', () => { throw Error('invalid signature'); }), /invalid signature/); }
  finally { rmSync(dir, { recursive: true, force: true }); }
});
