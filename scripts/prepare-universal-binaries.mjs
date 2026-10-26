import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, chmodSync, statSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = fileURLToPath(new URL('..', import.meta.url));

/** Tauri combines the main executable; its additional Cargo binaries need the same treatment. */
export function prepareUniversalBinaries({
  target = process.env.TAURI_ENV_TARGET_TRIPLE,
  debug = process.env.TAURI_ENV_DEBUG === 'true',
  root = repository,
  metadata,
  execute = execFileSync,
} = {}) {
  if (target !== 'universal-apple-darwin') return [];
  const backend = join(root, 'src-tauri');
  const name = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).name;
  const cargo = metadata ?? JSON.parse(execute('cargo', ['metadata', '--no-deps', '--offline', '--format-version', '1', '--manifest-path', join(backend, 'Cargo.toml')], { cwd: backend, encoding: 'utf8' }));
  const pkg = cargo.packages.find(pkg => pkg.name === name);
  if (!pkg) throw new Error('The application package is missing from Cargo metadata.');
  const main = pkg.default_run ?? pkg.targets.find(t => t.src_path?.replaceAll('\\', '/').endsWith('/src/main.rs'))?.name;
  if (!main) throw new Error('Set default-run to identify the main application binary.');
  const directory = cargo.target_directory ?? (process.env.CARGO_TARGET_DIR ? resolve(backend, process.env.CARGO_TARGET_DIR) : join(backend, 'target'));
  const profile = debug ? 'debug' : 'release';
  const plans = pkg.targets.filter(t => t.kind.includes('bin') && t.name !== main).map(t => ({
    name: t.name,
    inputs: ['x86_64-apple-darwin', 'aarch64-apple-darwin'].map(arch => join(directory, arch, profile, t.name)),
    output: join(directory, target, profile, t.name),
  }));
  // Validate every input before touching an existing universal output.
  for (const plan of plans) for (const input of plan.inputs) if (!existsSync(input)) throw new Error(`Missing auxiliary binary: ${input}`);
  for (const plan of plans) {
    mkdirSync(resolve(plan.output, '..'), { recursive: true });
    execute('lipo', ['-create', ...plan.inputs, '-output', plan.output], { stdio: 'inherit' });
    execute('lipo', ['-verify_arch', 'x86_64', 'arm64', plan.output], { stdio: 'inherit' });
    chmodSync(plan.output, statSync(plan.inputs[0]).mode & 0o777);
  }
  return plans.map(p => p.name);
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const prepared = prepareUniversalBinaries();
  if (prepared.length) console.log(`Prepared universal auxiliary binaries: ${prepared.join(', ')}`);
}
