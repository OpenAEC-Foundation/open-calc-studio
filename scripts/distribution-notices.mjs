import { mkdirSync, copyFileSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
export function copyNotices(destination) {
  const target = path.join(destination, 'licenses'); mkdirSync(target, { recursive: true });
  for (const name of ['LICENSE', 'COPYING', 'NOTICE.md']) copyFileSync(name, path.join(target, name));
  const blueprint = path.join(target, 'blueprint'); mkdirSync(blueprint, { recursive: true });
  for (const name of ['SOURCE.json', 'LICENSE']) copyFileSync('src/styles/blueprint/' + name, path.join(blueprint, name));
  for (const name of readdirSync('src/styles/blueprint/fonts').filter(name => name.endsWith('-OFL.txt'))) copyFileSync('src/styles/blueprint/fonts/' + name, path.join(blueprint, name));
}

/** Preserve the actual notices for packages included by the bundler. */
export function thirdPartyNotices(inputs) {
  const packages = new Map();
  for (const input of inputs) {
    if (!input.includes('node_modules/')) continue;
    let dir = path.dirname(path.resolve(input));
    while (dir.includes('node_modules')) {
      const manifest = path.join(dir, 'package.json');
      if (existsSync(manifest)) {
        const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
        if (pkg.name && pkg.version) {
          const notices = readdirSync(dir).filter(name => /^(licen[cs]e|copying|notice)(\.|$)/i.test(name))
            .filter(name => !name.endsWith('.json'))
            .map(name => { try { return `${name}\n${readFileSync(path.join(dir, name), 'utf8')}`; } catch { return ''; } }).filter(Boolean);
          packages.set(`${pkg.name}@${pkg.version}`, `${pkg.name}@${pkg.version}\nLicense: ${pkg.license ?? 'See upstream package'}\nSource: ${typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url ?? pkg.homepage ?? 'npm:' + pkg.name}\n${notices.join('\n\n')}`);
          break;
        }
      }
      dir = path.dirname(dir);
    }
  }
  return 'Third-party components included in this build.\nSee licenses/ for Open Calc Studio and Blueprint notices.\n\n' + [...packages].sort(([a], [b]) => a.localeCompare(b)).map(([, text]) => text).join('\n\n' + '='.repeat(72) + '\n\n') + '\n';
}

export function buildInfo(kind) {
  let commit = 'unknown', dirty = true;
  try {
    commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    dirty = !!execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim();
  } catch { /* Exported source tarballs can have no Git directory. */ }
  return { version: JSON.parse(readFileSync('package.json', 'utf8')).version, kind, commit, dirty,
    blueprint: JSON.parse(readFileSync('src/styles/blueprint/SOURCE.json', 'utf8')).commit };
}

export function distributionPlugin(kind) {
  let destination;
  return { name: 'openaec-distribution-notices', apply: 'build',
    configResolved(config) { destination = path.resolve(config.root, config.build.outDir); },
    generateBundle(_options, bundle) {
      const inputs = Object.values(bundle).flatMap(chunk => chunk.type === 'chunk' ? Object.keys(chunk.modules) : []);
      this.emitFile({ type: 'asset', fileName: 'THIRD-PARTY-NOTICES.txt', source: thirdPartyNotices(inputs) });
      this.emitFile({ type: 'asset', fileName: 'build-info.json', source: JSON.stringify(buildInfo(kind), null, 2) + '\n' });
    },
    closeBundle() { copyNotices(destination); },
  };
}
