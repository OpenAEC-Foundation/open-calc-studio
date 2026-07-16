const APP_NAME = 'OpenCalcStudio';

function isTauriEnvironment(): boolean {
  return '__TAURI_INTERNALS__' in window;
}

export async function getAppVersion(): Promise<string> {
  if (!isTauriEnvironment()) return __APP_VERSION__;
  try {
    const { getVersion } = await import('@tauri-apps/api/app');
    return await getVersion();
  } catch {
    return __APP_VERSION__;
  }
}

// Resolve raw OS type + version into a human-friendly name
const WINDOWS_BUILDS: [number, string][] = [
  [22000, 'Windows 11'],
  [0, 'Windows 10'],
];
const WINDOWS_VERSIONS: [number, number, string][] = [
  [6, 3, 'Windows 8.1'],
  [6, 2, 'Windows 8'],
  [6, 1, 'Windows 7'],
];
const MACOS_NAMES: Record<number, string> = {
  26: 'Tahoe', 15: 'Sequoia', 14: 'Sonoma', 13: 'Ventura',
  12: 'Monterey', 11: 'Big Sur',
};

function resolveOsName(rawType: string, rawVersion: string): string {
  const type = rawType.toLowerCase();
  const parts = rawVersion.split('.').map((p) => parseInt(p) || 0);
  const [major, minor, build] = parts;

  if (type === 'windows') {
    if (major === 10 && minor === 0) {
      for (const [minBuild, name] of WINDOWS_BUILDS) {
        if (build >= minBuild) return `${name} ${build}`;
      }
    }
    for (const [maj, min, name] of WINDOWS_VERSIONS) {
      if (major === maj && minor === min) return `${name} ${rawVersion}`;
    }
    return `Windows ${rawVersion}`;
  }

  if (type === 'macos' || type === 'darwin') {
    const name = major === 10 ? 'macOS' : (MACOS_NAMES[major] ? `macOS ${MACOS_NAMES[major]}` : 'macOS');
    return `${name} ${rawVersion}`;
  }

  if (type === 'linux') return `Linux ${rawVersion}`;
  return `${rawType} ${rawVersion}`;
}

interface OsInfo {
  name: string;
  arch: string;
}

let _osInfoCache: OsInfo | null = null;

async function getOsInfo(): Promise<OsInfo> {
  if (_osInfoCache) return _osInfoCache;
  if (!isTauriEnvironment()) {
    _osInfoCache = { name: 'Browser', arch: '' };
    return _osInfoCache;
  }
  try {
    const os = await import('@tauri-apps/plugin-os');
    const name = resolveOsName(os.type(), os.version());
    _osInfoCache = { name, arch: os.arch() || '' };
  } catch {
    _osInfoCache = { name: 'Unknown', arch: '' };
  }
  return _osInfoCache;
}

/** Build a User-Agent string: OpenCalcStudio/{version} (Windows 11 22631; x86_64) */
export async function buildUserAgent(): Promise<string> {
  const ver = await getAppVersion();
  const os = await getOsInfo();
  return `${APP_NAME}/${ver} (${os.name}; ${os.arch})`.replace(/\s+/g, ' ').trim();
}
