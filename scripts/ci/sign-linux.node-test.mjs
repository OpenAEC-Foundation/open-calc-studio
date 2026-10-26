import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('OpenPGP signs/verifies fixtures, rejects the wrong identity and keeps unconfigured tags closed', () => {
  const root = mkdtempSync(join(tmpdir(), 'ocs-signing-test-'));
  const home = join(root, 'key'); mkdirSync(home, { mode: 0o700 });
  const env = { ...process.env, GNUPGHOME: home };
  const gpg = args => execFileSync('gpg', ['--batch', '--pinentry-mode', 'loopback', '--passphrase', 'fixture-only', ...args], { env, timeout: 10000 });
  const script = fileURLToPath(new URL('./sign-linux.sh', import.meta.url));
  const files = ['fixture.AppImage', 'fixture.deb', 'fixture.rpm', 'SHA256SUMS.txt'];
  function run(name, key, fingerprint, ref = 'refs/tags/v2026.44.0') {
    const cwd = join(root, name), artifacts = join(cwd, 'release-artifacts'); mkdirSync(artifacts, { recursive: true });
    for (const file of files) writeFileSync(join(artifacts, file), 'Signing test fixture\n');
    const result = spawnSync('bash', [script], { cwd, env: { ...env,
      OPENAEC_GPG_PRIVATE_KEY: key, OPENAEC_GPG_PASSPHRASE: 'fixture-only', OPENAEC_GPG_FINGERPRINT: fingerprint,
      GITHUB_REF: ref, GITHUB_SHA: 'test-fixture',
    }, encoding: 'utf8', timeout: 20000 });
    return { ...result, artifacts };
  }
  try {
    gpg(['--quick-generate-key', 'Open Calc Studio test fixture <fixture@example.invalid>', 'ed25519', 'sign', '1d']);
    const fingerprint = gpg(['--with-colons', '--list-secret-keys']).toString().split('\n').find(line => line.startsWith('fpr:')).split(':')[9];
    const key = gpg(['--armor', '--export-secret-keys', fingerprint]).toString();
    const wrong = run('wrong', key, '0'.repeat(40));
    assert.notEqual(wrong.status, 0); assert.ok(!existsSync(join(wrong.artifacts, 'fixture.AppImage.asc')));
    const signed = run('signed', key, fingerprint); assert.equal(signed.status, 0, signed.stderr);
    for (const file of [...files.slice(0, 3), 'SHA256SUMS-linux.txt']) gpg(['--verify', join(signed.artifacts, file + '.asc'), join(signed.artifacts, file)]);
    const evidence = JSON.parse(readFileSync(join(signed.artifacts, 'linux-signing-evidence.json'), 'utf8'));
    assert.equal(evidence.signed, true); assert.equal(evidence.fingerprint, fingerprint);
    assert.notEqual(run('tag-without-key', '', '').status, 0);
    const manual = run('manual-without-key', '', '', 'refs/heads/test'); assert.equal(manual.status, 0);
    assert.equal(JSON.parse(readFileSync(join(manual.artifacts, 'linux-signing-evidence.json'), 'utf8')).signed, false);
  } finally {
    execFileSync('gpgconf', ['--kill', 'gpg-agent'], { env, timeout: 10000 });
    rmSync(root, { recursive: true, force: true });
  }
});
