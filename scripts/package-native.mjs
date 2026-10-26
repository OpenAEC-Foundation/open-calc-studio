import { cpSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { copyNotices, buildInfo } from './distribution-notices.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const target = process.env.BUILD_TARGET || '';
const profile = process.env.BUILD_PROFILE || 'debug';
if (!['debug', 'release'].includes(profile)) throw Error('BUILD_PROFILE must be debug or release.');
if (target && !/^[a-zA-Z0-9_-]+$/.test(target)) throw Error('Invalid BUILD_TARGET.');
const windows = target ? target.includes('windows') : process.platform === 'win32';
const macos = target ? target.includes('apple') : process.platform === 'darwin';
if (!windows && !macos && process.platform !== 'linux') throw Error('This packager supports Windows, macOS and Linux.');
const source = resolve(root, 'src-tauri/target', target, profile);
const output = resolve(root, 'release-native', `${target || process.platform}-${profile}`);
const libraryName = windows ? 'OpenCalcStudio.dll' : macos ? 'libOpenCalcStudio.dylib' : 'libOpenCalcStudio.so';
const library = join(source, windows ? 'app_lib.dll' : macos ? 'libapp_lib.dylib' : 'libapp_lib.so');
const binary = [windows ? 'open-calc-studio.exe' : 'open-calc-studio', windows ? 'Open Calc Studio.exe' : 'Open Calc Studio']
  .map(name => join(source, name)).find(existsSync);
if (!existsSync(library) || !binary) throw Error(`Build the library and executable first: ${source}`);
mkdirSync(output, { recursive: true });
copyNotices(output);
if (existsSync(join(root, 'dist/THIRD-PARTY-NOTICES.txt'))) copyFileSync(join(root, 'dist/THIRD-PARTY-NOTICES.txt'), join(output, 'THIRD-PARTY-NOTICES.txt'));
copyFileSync(library, join(output, libraryName));
copyFileSync(binary, join(output, windows ? 'OpenCalcStudio.exe' : 'OpenCalcStudio'));
const hostName = windows ? 'OpenCalcStudioHost.exe' : 'OpenCalcStudioHost';
if (existsSync(join(source, hostName))) copyFileSync(join(source, hostName), join(output, hostName));
if (process.env.NATIVE_STRIP) {
  for (const name of [libraryName, windows ? 'OpenCalcStudio.exe' : 'OpenCalcStudio']) {
    const stripped = spawnSync(process.env.NATIVE_STRIP, ['--strip-debug', join(output, name)], { stdio: 'inherit' });
    if (stripped.error || stripped.status !== 0) throw Error(`Failed to strip ${name}`);
  }
}
for (const file of ['README.md', 'open_calc_studio.h', 'host.c', 'Host.cs']) copyFileSync(join(root, 'packages/native', file), join(output, file));
writeFileSync(join(output, 'README.md'), readFileSync(join(output, 'README.md'), 'utf8').replace('../../docs/mcp-desktop.md', 'docs/mcp-desktop.md'));
mkdirSync(join(output, 'docs'), { recursive: true });
for (const file of ['mcp-desktop.md', 'ifc-lite-splitview.md']) copyFileSync(join(root, 'docs', file), join(output, 'docs', file));
copyFileSync(join(root, 'mcp-server/dist/ocs-mcp.mjs'), join(output, 'ocs-mcp.mjs'));
cpSync(join(root, 'src-tauri/resources'), join(output, 'resources'), { recursive: true });
mkdirSync(join(output, 'icons'), { recursive: true });
copyFileSync(join(root, 'src-tauri/icons/icon.png'), join(output, 'icons/icon.png'));
if (windows) copyFileSync(join(root, 'src-tauri/WebView2Loader.dll'), join(output, 'WebView2Loader.dll'));
if (windows && !target.includes('gnu')) {
  // The DLL can import newer C++ runtime entry points than the runner's
  // system installation. Ship the redistributable matching the build tools.
  const cpu = target.startsWith('aarch64') || (!target && process.arch === 'arm64') ? 'arm64' : target.startsWith('i686') ? 'x86' : 'x64';
  const roots = [process.env.OCS_VC_REDIST_DIR, process.env.VCToolsRedistDir].filter(Boolean);
  const candidates = roots.flatMap(dir => {
    const base = join(dir, cpu);
    return [dir, ...(existsSync(base) ? readdirSync(base).filter(name => /^Microsoft\.VC\d+\.CRT$/i.test(name)).map(name => join(base, name)) : [])];
  });
  const crt = candidates.find(dir => existsSync(join(dir, 'vcruntime140.dll')) && existsSync(join(dir, 'msvcp140.dll')));
  if (!crt) throw Error('Run packaging in a Visual Studio developer shell, or set OCS_VC_REDIST_DIR to the matching Microsoft.VC*.CRT directory.');
  for (const name of readdirSync(crt).filter(name => /\.dll$/i.test(name))) copyFileSync(join(crt, name), join(output, name));
  writeFileSync(join(output, 'licenses/MSVC-RUNTIME-NOTICE.txt'), 'Microsoft Visual C++ runtime redistributables are distributed alongside this Windows build under their Microsoft terms, not the Open Calc Studio LGPL license.\nhttps://learn.microsoft.com/cpp/windows/redistributing-visual-cpp-files\n');
}
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
writeFileSync(join(output, 'build-info.json'), JSON.stringify({ ...buildInfo('native'), version, abi: 1, target: target || process.platform, architecture: target ? target.split('-')[0] : process.arch, profile, signed: false }, null, 2) + '\n');
// Re-run after compiling the example host if it should be included in checksums.
function files(dir) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}
writeFileSync(join(output, 'SHA256SUMS'), files(output).filter(p => !p.endsWith('SHA256SUMS')).sort().map(p =>
  `${createHash('sha256').update(readFileSync(p)).digest('hex')}  ${p.slice(output.length + 1).replaceAll('\\', '/')}`
).join('\n') + '\n');
console.log(output);
