import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

/** Verify delivered bytes with the pinned OpenAEC Installer verifier. */
export function verifyUpdaterAssets(directory, key, verifier) {
  const names = readdirSync(directory).filter(name => /(-setup\.exe|\.msi|\.AppImage|\.app\.tar\.gz)$/i.test(name)).sort();
  if (!names.length) throw Error('No updater artifacts to verify');
  const artifacts = names.map(name => {
    const signature = readFileSync(join(directory, name + '.sig'), 'utf8');
    const data = readFileSync(join(directory, name));
    const trustedComment = verifier(key, signature, data);
    return { name, sha256: createHash('sha256').update(data).digest('hex'), trustedComment };
  });
  return { verified: true, updaterPublicKeySha256: createHash('sha256').update(key).digest('hex'), artifacts };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const verifierUrl = pathToFileURL(resolve(process.argv[2] ?? '.release-kit/release-kit/minisign.mjs'));
  const { verifySignature } = await import(verifierUrl.href);
  const { platformsFor } = await import(new URL('./latest-json.mjs', verifierUrl).href);
  const directory = process.argv[3] ?? 'release-artifacts';
  const config = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'));
  const result = verifyUpdaterAssets(directory, config.plugins.updater.pubkey, verifySignature);
  for (const artifact of result.artifacts) {
    if (!platformsFor(artifact.name)) throw Error(`OpenAEC Installer cannot discover updater platforms for ${artifact.name}`);
  }
  const target = process.env.BUILD_TARGET ?? 'local';
  if (!/^[a-zA-Z0-9_-]+$/.test(target)) throw Error('Invalid BUILD_TARGET');
  writeFileSync(join(directory, `updater-${target}-verification-evidence.json`), JSON.stringify(result, null, 2) + '\n');
  console.log(`Verified ${result.artifacts.length} delivered updater artifacts against the existing public key.`);
}
