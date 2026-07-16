/**
 * Native file operations via Tauri plugins.
 * All imports are dynamic so the module loads safely in browser mode.
 */

const OCS_FILTER = { name: 'Open Calc Studio', extensions: ['ifcCalc', 'ifcx', 'ocs'] };
const JSON_FILTER = { name: 'JSON', extensions: ['json'] };
const ALL_SUPPORTED_FILTER = { name: 'Alle ondersteunde bestanden', extensions: ['ifcCalc', 'ifcx', 'ocs', 'json', 'calc', 'mdb', 'xtb', 'xls', 'xlsx', 'rsx', 'dnc'] };
const WPCALC_FILTER = { name: 'WpCalc', extensions: ['calc', 'mdb'] };
const XTB_FILTER = { name: 'IBIS-TRAD', extensions: ['xtb'] };
const EXCEL_FILTER = { name: 'Excel', extensions: ['xls', 'xlsx'] };
const RSX_FILTER = { name: 'RAW Bestek', extensions: ['rsx'] };
const DNC_FILTER = { name: 'STABU-directiebegroting', extensions: ['dnc'] };

export function isTauriEnvironment(): boolean {
  return '__TAURI_INTERNALS__' in window;
}

// Lazy-loaded Tauri APIs — null when running in browser
let _dialog: typeof import('@tauri-apps/plugin-dialog') | null = null;
let _fs: typeof import('@tauri-apps/plugin-fs') | null = null;
let _loaded = false;

async function loadTauriApis() {
  if (_loaded) return;
  _loaded = true;
  if (!isTauriEnvironment()) return;
  try {
    const [dialog, fs] = await Promise.all([
      import('@tauri-apps/plugin-dialog'),
      import('@tauri-apps/plugin-fs'),
    ]);
    _dialog = dialog;
    _fs = fs;
  } catch {
    // Running without Tauri — browser mode
  }
}

// Start loading immediately (non-blocking)
void loadTauriApis();

/** Show native open dialog and read the selected file. Returns null if cancelled. */
export async function openFileNative(): Promise<{ path: string; content: string } | null> {
  await loadTauriApis();
  if (!_dialog || !_fs) return null;
  const selected = await _dialog.open({
    multiple: false,
    filters: [ALL_SUPPORTED_FILTER, OCS_FILTER, WPCALC_FILTER, XTB_FILTER, EXCEL_FILTER, RSX_FILTER, DNC_FILTER, JSON_FILTER],
  });
  if (!selected) return null;
  const filePath = typeof selected === 'string' ? selected : selected;
  if (!filePath) return null;
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  // Binary formats: read as bytes
  if (['calc', 'mdb', 'xtb', 'xls', 'xlsx', 'dnc'].includes(ext)) {
    // Binary format — caller will re-read as binary via openBinaryFileNative
    return { path: filePath, content: '__BINARY__' };
  }
  const content = await _fs.readTextFile(filePath);
  return { path: filePath, content };
}

/** Read a binary file by path (no dialog). Returns ArrayBuffer. */
export async function readBinaryFileByPath(filePath: string): Promise<ArrayBuffer> {
  await loadTauriApis();
  if (!_fs) throw new Error('Tauri FS not available');
  const bytes = await _fs.readFile(filePath);
  return bytes.buffer;
}

/** Show native open dialog for any file type. Returns ArrayBuffer or null if cancelled. */
export async function openBinaryFileNative(
  filterName: string,
  extensions: string[],
): Promise<{ path: string; data: ArrayBuffer } | null> {
  await loadTauriApis();
  if (!_dialog || !_fs) return null;
  const selected = await _dialog.open({
    multiple: false,
    filters: [{ name: filterName, extensions }],
  });
  if (!selected) return null;
  const filePath = typeof selected === 'string' ? selected : selected;
  if (!filePath) return null;
  const bytes = await _fs.readFile(filePath);
  return { path: filePath, data: bytes.buffer };
}

/** Show native open dialog for text files. Returns string content or null if cancelled. */
export async function openTextFileNative(
  filterName: string,
  extensions: string[],
): Promise<{ path: string; content: string } | null> {
  await loadTauriApis();
  if (!_dialog || !_fs) return null;
  const selected = await _dialog.open({
    multiple: false,
    filters: [{ name: filterName, extensions }],
  });
  if (!selected) return null;
  const filePath = typeof selected === 'string' ? selected : selected;
  if (!filePath) return null;
  const content = await _fs.readTextFile(filePath);
  return { path: filePath, content };
}

/**
 * Show native save dialog and write content. Returns saved path or null if cancelled.
 * `defaultPathOrName` may be a full absolute path (preferred — preserves folder)
 * or a bare name, in which case `.ifcCalc` is appended.
 */
export async function saveFileAsNative(content: string, defaultPathOrName: string): Promise<string | null> {
  await loadTauriApis();
  if (!_dialog || !_fs) return null;
  const looksLikePath = /[\\/]/.test(defaultPathOrName) || /\.[A-Za-z0-9]{2,5}$/.test(defaultPathOrName);
  const defaultPath = looksLikePath ? defaultPathOrName : `${defaultPathOrName}.ifcCalc`;
  const filePath = await _dialog.save({
    filters: [OCS_FILTER],
    defaultPath,
  });
  if (!filePath) return null;
  await _fs.writeTextFile(filePath, content);
  return filePath;
}

/** Write content directly to a known path (no dialog). */
export async function saveFileToPath(path: string, content: string): Promise<void> {
  await loadTauriApis();
  if (!_fs) throw new Error('File system not available in browser mode');
  await _fs.writeTextFile(path, content);
}

/** Show an error message dialog. */
export async function showError(msg: string): Promise<void> {
  await loadTauriApis();
  if (!_dialog) {
    // Browser fallback
    window.alert(msg);
    return;
  }
  await _dialog.message(msg, { title: 'Error', kind: 'error' });
}
