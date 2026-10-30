import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function checkUpdaterConfig(config, expectedKey) {
  if (!config.bundle?.createUpdaterArtifacts) return;
  const key = config.plugins?.updater?.pubkey;
  if (typeof key !== 'string' || !key.trim()) throw Error('Updater artifacts require plugins.updater.pubkey');
  const lines = Buffer.from(key.trim(), 'base64').toString('utf8').trim().split(/\r?\n/);
  const raw = Buffer.from(lines.at(-1), 'base64');
  if (!lines[0].startsWith('untrusted comment:') || raw.length !== 42 || !['Ed', 'ED'].includes(raw.subarray(0, 2).toString())) throw Error('Invalid minisign updater public key');
  if (expectedKey && key.trim() !== expectedKey.trim()) throw Error('Tauri updater key differs from the repository UPDATER_PUBKEY');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  checkUpdaterConfig(JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8')), process.env.UPDATER_PUBKEY);
  console.log('Updater artifacts and existing public signing key are configured consistently.');
}
