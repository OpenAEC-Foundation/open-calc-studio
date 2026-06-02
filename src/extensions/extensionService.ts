/**
 * Extension installation, removal, and catalog management.
 */
import type { ExtensionManifest, InstalledExtension, CatalogEntry } from './types';
import {
  saveExtensionToDb,
  removeExtensionFromDb,
  enableExtension,
  disableExtension,
  getActivePlugins,
} from './extensionLoader';
import { useAppStore } from '../state/appStore';

// ── Catalog ──

const CATALOG_URL =
  'https://raw.githubusercontent.com/OpenAEC-Foundation/open-calc-studio-extensions/main/catalog.json';
const CATALOG_CACHE_MS = 30 * 60 * 1000; // 30 min

export async function fetchCatalog(): Promise<void> {
  const store = useAppStore.getState();
  const now = Date.now();

  // Skip if recently fetched
  if (store.catalogLastFetched && now - store.catalogLastFetched < CATALOG_CACHE_MS) return;

  store.setCatalogLoading(true);
  store.setCatalogError(null);

  try {
    const res = await fetch(CATALOG_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const catalog = await res.json();
    store.setCatalog(catalog.extensions || [], now);
  } catch (err: any) {
    store.setCatalogError(err.message || 'Failed to fetch catalog');
  } finally {
    store.setCatalogLoading(false);
  }
}

// ── Install from Catalog ──

export async function installFromCatalog(entry: CatalogEntry): Promise<boolean> {
  try {
    const res = await fetch(entry.downloadUrl);
    if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);

    const blob = await res.blob();
    return await installFromZipBlob(blob, entry.id);
  } catch (err) {
    console.error('[Extensions] Install from catalog failed:', err);
    return false;
  }
}

// ── Install from local ZIP file ──

export async function installFromFile(): Promise<boolean> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) { resolve(false); return; }
      const result = await installFromZipBlob(file);
      resolve(result);
    };
    input.click();
  });
}

// ── Install from raw JS file (for simple extensions) ──

export async function installFromJsFile(): Promise<boolean> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.js';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) { resolve(false); return; }

      try {
        const mainCode = await file.text();

        // Try to extract manifest from a comment block or use defaults
        const manifest = extractManifestFromCode(mainCode, file.name);

        await saveExtensionToDb({
          id: manifest.id,
          manifest,
          mainCode,
          enabled: true,
        });

        const installed: InstalledExtension = {
          id: manifest.id,
          manifest,
          status: 'disabled',
        };
        useAppStore.getState().registerExtension(installed);
        await enableExtension(manifest.id);

        resolve(true);
      } catch (err) {
        console.error('[Extensions] Install from JS failed:', err);
        resolve(false);
      }
    };
    input.click();
  });
}

function extractManifestFromCode(code: string, fileName: string): ExtensionManifest {
  // Look for @manifest JSON block in comments
  const match = code.match(/@manifest\s*(\{[\s\S]*?\})\s*\*/);
  if (match) {
    try {
      return JSON.parse(match[1]);
    } catch { /* fall through */ }
  }

  // Generate a basic manifest from the filename
  const id = fileName.replace(/\.js$/, '').replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
  return {
    id,
    name: fileName.replace(/\.js$/, ''),
    version: '1.0.0',
    minAppVersion: __APP_VERSION__,
    author: 'Unknown',
    description: `Extension loaded from ${fileName}`,
    category: 'Other',
    main: 'main.js',
    permissions: ['commands', 'events'],
  };
}

// ── ZIP handling ──

async function installFromZipBlob(blob: Blob, overrideId?: string): Promise<boolean> {
  try {
    // Use JSZip-like approach with the built-in DecompressionStream API
    const arrayBuffer = await blob.arrayBuffer();
    const files = await parseZipEntries(arrayBuffer);

    // Find manifest.json
    const manifestEntry = files.find((f) => f.name.endsWith('manifest.json'));
    if (!manifestEntry) throw new Error('No manifest.json found in ZIP');

    const manifest: ExtensionManifest = JSON.parse(new TextDecoder().decode(manifestEntry.data));

    // Find main.js
    const mainPath = manifest.main || 'main.js';
    const mainEntry = files.find(
      (f) => f.name.endsWith(mainPath) || f.name.endsWith('/' + mainPath)
    );
    if (!mainEntry) throw new Error(`Main file "${mainPath}" not found in ZIP`);

    const mainCode = new TextDecoder().decode(mainEntry.data);
    const id = overrideId || manifest.id;

    // Check if already installed — disable first
    if (getActivePlugins().has(id)) {
      await disableExtension(id);
    }

    await saveExtensionToDb({
      id,
      manifest: { ...manifest, id },
      mainCode,
      enabled: true,
    });

    const installed: InstalledExtension = {
      id,
      manifest: { ...manifest, id },
      status: 'disabled',
    };
    useAppStore.getState().registerExtension(installed);
    await enableExtension(id);

    return true;
  } catch (err) {
    console.error('[Extensions] ZIP install failed:', err);
    return false;
  }
}

// ── Minimal ZIP parser (handles stored + deflate) ──

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

async function parseZipEntries(buffer: ArrayBuffer): Promise<ZipEntry[]> {
  const view = new DataView(buffer);
  const entries: ZipEntry[] = [];
  let offset = 0;

  while (offset < buffer.byteLength - 4) {
    const sig = view.getUint32(offset, true);
    if (sig !== 0x04034b50) break; // Local file header signature

    const method = view.getUint16(offset + 8, true);
    const compSize = view.getUint32(offset + 18, true);
    // const uncompSize = view.getUint32(offset + 22, true);
    const nameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);

    const nameBytes = new Uint8Array(buffer, offset + 30, nameLen);
    const name = new TextDecoder().decode(nameBytes);
    const dataOffset = offset + 30 + nameLen + extraLen;
    const compressedData = new Uint8Array(buffer, dataOffset, compSize);

    // Skip directories
    if (!name.endsWith('/')) {
      let data: Uint8Array;
      if (method === 0) {
        // Stored
        data = compressedData;
      } else if (method === 8) {
        // Deflate — use DecompressionStream
        const ds = new DecompressionStream('deflate-raw');
        const writer = ds.writable.getWriter();
        const reader = ds.readable.getReader();
        writer.write(compressedData);
        writer.close();

        const chunks: Uint8Array[] = [];
        let totalLen = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          totalLen += value.length;
        }
        data = new Uint8Array(totalLen);
        let pos = 0;
        for (const chunk of chunks) {
          data.set(chunk, pos);
          pos += chunk.length;
        }
      } else {
        throw new Error(`Unsupported compression method: ${method}`);
      }

      // Strip common directory prefix
      const cleanName = name.replace(/^[^/]+\//, '');
      if (cleanName) {
        entries.push({ name: cleanName, data });
      }
    }

    offset = dataOffset + compSize;
  }

  return entries;
}

// ── Remove extension ──

export async function removeExtension(id: string): Promise<void> {
  // Disable first
  if (getActivePlugins().has(id)) {
    await disableExtension(id);
  }

  // Remove from DB
  await removeExtensionFromDb(id);

  // Remove from store
  useAppStore.getState().unregisterExtension(id);

  // Clear settings
  const prefix = `ext:${id}:`;
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(prefix)) keysToRemove.push(key);
  }
  keysToRemove.forEach((k) => localStorage.removeItem(k));
}
