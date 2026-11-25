import { uiText } from '@/i18n/uiText';
import { createDefaultItems } from '@/data/defaultBudget';
import { getSiteHost, HOST_RECENT_PREFIX } from '@/services/file/siteHost';
import { openHostedFile, saveHostedFile } from '@/services/file/hostFileActions';
import { pickHostFile } from '@/components/common/HostFileDialog';
import { useCallback } from 'react';
import { documentChangedSince, serializeDocument } from '@/services/file/documentSnapshot';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/state/appStore';
import { openImportResult, openProjectInStore, openProjectJson } from '@/services/file/openProject';
import { deserializeProject } from '@/services/file/fileService';
import {
  isTauriEnvironment,
  openFileNative,
  saveFileAsNative,
  saveFileToPath,
  showError,
} from '@/services/file/nativeFileService';
import { showImportWarnings } from '@/components/common/ImportWarningsDialog';

/** De gebruiker sloot het koppelvenster van een Excel-import: geen foutmelding. */
function isImportCancelled(err: unknown): boolean {
  return err instanceof Error && err.name === 'ImportCancelledError';
}

function fileNameFromPath(filePath: string): string {
  const segments = filePath.replace(/\\/g, '/').split('/');
  const fullName = segments[segments.length - 1];
  return fullName.replace(/\.(ifcx|json)$/i, '');
}

/** Extensies waarin OCS zijn native JSON-projectformaat wegschrijft. */
const NATIVE_SAVE_EXTS = ['ifccalc', 'ifcx', 'ocs', 'json'];

/** Is dit pad een native OCS-bestand waar we in-place naartoe mogen schrijven? */
export function isNativeSavePath(filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  return NATIVE_SAVE_EXTS.includes(ext);
}

/**
 * Voorstel-pad voor Opslaan (als): map + bestandsnaam van het document
 * behouden, maar de extensie altijd .ifcCalc — het standaard native formaat.
 * Ook voor documenten die uit een import (.xls/.xtb/…) komen: opslaan
 * schrijft immers altijd het OCS-formaat, nooit het bronformaat.
 */
export function toIfcCalcPath(filePath: string | null | undefined, fileName: string | null | undefined): string {
  if (filePath) return filePath.replace(KNOWN_FILE_EXTENSION, '') + '.ifcCalc';
  const base = (fileName || 'begroting').replace(KNOWN_FILE_EXTENSION, '');
  return `${base || 'begroting'}.ifcCalc`;
}

/**
 * Extensies die OCS opent of importeert. Alleen die gaan eraf bij het voorstel
 * voor de opslagnaam: "Begroting v1.2" blijft "Begroting v1.2" (knownbug 63).
 */
const KNOWN_FILE_EXTENSION = /\.(ifccalc|ifcx|ocs|json|calc|mdb|xtb|xlsx?|csv|rsx|dnc|bc3|onl[vb]|x8[1-7]|xml|xpwe|xc4|cuf|ifc)$/i;

/**
 * Sommige bestanden dragen een .calc/.mdb-extensie maar zijn in werkelijkheid
 * een native OCS-project (JSON) — bijv. een begroting die met de verkeerde
 * extensie is opgeslagen. Detecteer dat aan de inhoud (eerste niet-witruimte
 * byte is `{`) en open ze als native, in plaats van ze door de Access-importer
 * te duwen — die faalt dan met "Wrong page type. Expected 0 but received 123".
 */
export function sniffNativeProject(data: ArrayBuffer): ReturnType<typeof deserializeProject> | null {
  try {
    const bytes = new Uint8Array(data);
    let i = 0;
    // UTF-8 BOM + voorafgaande witruimte overslaan
    while (i < bytes.length && [0x20, 0x09, 0x0a, 0x0d, 0xef, 0xbb, 0xbf].includes(bytes[i])) i++;
    if (bytes[i] !== 0x7b) return null; // geen '{' → echt binair (Access/Excel)
    const parsed = deserializeProject(new TextDecoder('utf-8').decode(data));
    return parsed?.schedule && Array.isArray(parsed.items) ? parsed : null;
  } catch {
    return null;
  }
}

/** Extensies waarvan de inhoud een native OCS-project (JSON) is. */
const NATIVE_OPEN_EXTS = ['ifccalc', 'ifcx', 'ocs', 'json'];

/**
 * Een bestand van schijf openen (desktop: Openen en Recente bestanden, één
 * pad voor beide). Native JSON opent als project; een .calc/.mdb met
 * JSON-inhoud ook, met spreadsheets en al (knownbug 62). Andere formaten gaan
 * naar de geregistreerde importeur, en anders naar de algemene import (CSV,
 * GAEB …), nooit naar de JSON-lezer (knownbug 61). `text` is de al gelezen
 * inhoud van een native bestand. Gooit bij een fout.
 */
export async function openDesktopFile(filePath: string, text?: string): Promise<void> {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const fullName = filePath.replace(/\\/g, '/').split('/').pop() || filePath;
  const baseName = fullName.replace(/\.[^.]+$/, '');
  if (NATIVE_OPEN_EXTS.includes(ext)) {
    const content = text ?? await (await import('@tauri-apps/plugin-fs')).readTextFile(filePath);
    // Naam zonder extensie, ook bij .ifcCalc (zoals dubbelklikken en slepen dat al deden).
    openProjectJson(content, baseName, filePath);
    return;
  }
  const { readBinaryFileByPath } = await import('@/services/file/nativeFileService');
  const data = await readBinaryFileByPath(filePath);
  // Inhoud-sniff: een .calc/.mdb met JSON-inhoud is een native OCS-project
  const native = ext === 'calc' || ext === 'mdb' ? sniffNativeProject(data) : null;
  if (native) {
    openProjectInStore(native, baseName, filePath);
    return;
  }
  const imp = useAppStore.getState().extensionImporters.find(i => i.fileExtensions.some(fe => fe.replace(/^\./, '').toLowerCase() === ext));
  const importResult = imp
    ? { warnings: [], ...await imp.handler(new File([data], fullName)) }
    : await (await import('@/lib/importers')).importBudget(data, fullName);
  openImportResult(importResult, baseName, filePath);
  showImportWarnings(importResult, fullName);
}

/** Extensies die openDesktopFile zelf leest (native of via de algemene import). */
const DESKTOP_OPEN_EXTS = [
  ...NATIVE_OPEN_EXTS, 'calc', 'mdb', 'xtb', 'xls', 'xlsx', 'csv', 'rsx', 'dnc', 'bc3', 'onlv', 'onlb',
  'x81', 'x82', 'x83', 'x84', 'x86', 'x87', 'xml', 'xpwe', 'xc4', 'cuf',
];

/** Kan openDesktopFile dit bestand openen? Een PDF of IFC bijvoorbeeld niet. */
export function canOpenDesktopFile(filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  return DESKTOP_OPEN_EXTS.includes(ext)
    || useAppStore.getState().extensionImporters.some(i => i.fileExtensions.some(fe => fe.replace(/^\./, '').toLowerCase() === ext));
}

/**
 * Bestanden die het besturingssysteem aanreikt (dubbelklik op een gekoppeld
 * bestand, slepen naar het venster): hetzelfde pad als Openen, dus een .calc
 * met JSON-inhoud houdt zijn spreadsheets en een CSV wordt geïmporteerd.
 * Bestanden die OCS niet opent, slaan we over; een fout wordt gemeld.
 */
export async function openDesktopFiles(filePaths: string[]): Promise<void> {
  for (const filePath of filePaths) {
    if (!canOpenDesktopFile(filePath)) continue;
    try {
      await openDesktopFile(filePath);
    } catch (err) {
      if (isImportCancelled(err)) continue;
      console.error('[Open] Failed to open:', filePath, err);
      await showError(uiText('files.openFailed', 'Cannot open file: {{error}}', { error: String(err) }));
    }
  }
}

export function useFileOperations() {
  const { t } = useTranslation();
  const {
    updateDocument,
    setCompanyInfo,
    addDocument,
    settings, updateSettings,
  } = useAppStore();

  const addToRecentFiles = useCallback((filePath: string) => {
    const current = settings.recentFiles ?? [];
    const filtered = current.filter((p: string) => p !== filePath);
    const updated = [filePath, ...filtered].slice(0, 10);
    updateSettings({ recentFiles: updated });
  }, [settings.recentFiles, updateSettings]);

  // ─── NEW FILE ───
  const newFile = useCallback(() => {
    const id = crypto.randomUUID();
    const baseName = t('newBudget');
    // Find next available number: "New budget", "New budget 2", "New budget 3", ...
    const currentDocs = useAppStore.getState().documents;
    const existingNames = new Set(currentDocs.map((d) => d.fileName));
    let fileName = baseName;
    let counter = 2;
    while (existingNames.has(fileName)) {
      fileName = `${baseName} ${counter}`;
      counter++;
    }
    addDocument({ id, filePath: null, fileName, isModified: false, items: createDefaultItems() });
  }, [addDocument, t]);

  // ─── SAVE (to existing path, or delegate to Save As) ───
  const saveFile = useCallback(async () => {
    // Always read the freshest active tab from the store to avoid stale closures.
    const state = useAppStore.getState();
    const activeId = state.activeDocumentId;
    const doc = state.documents.find((d) => d.id === activeId);
    if (!doc) return;

    // Zelfde serialisatie als de controle op wijzigingen: met de aanmaakdatum
    // van het bestand en het actieve spreadsheet (knownbugs 110, 111).
    const json = serializeDocument(state, doc);

    if (getSiteHost()) {
      try {
        const saved = await saveHostedFile(activeId);
        // The host kept someone else's newer version and stored these edits as a copy (Blueprint contract).
        if (saved?.redirected) window.alert(uiText('host.savedAsCopy', 'Someone else saved a newer version of this file in the meantime. Your changes were saved as a copy: {{name}}. Saving now goes to that copy.', { name: saved.name }));
      } catch (err) {
        // A host that refuses a stale save instead of making a copy: the edits stay in the app (still unsaved).
        if ((err as { code?: unknown } | null)?.code === 'VERSION_CONFLICT') window.alert(uiText('host.versionConflict', 'Not saved: someone else saved a newer version of this file in the meantime. Your changes are still here. Use Save as to keep them in a new file.'));
        else await showError(`Failed to save: ${err instanceof Error ? err.message : JSON.stringify(err)}`);
      }
      return;
    }

    if (doc.filePath && isNativeSavePath(doc.filePath) && isTauriEnvironment()) {
      try {
        await saveFileToPath(doc.filePath, json);
        updateDocument(activeId, { isModified: documentChangedSince(useAppStore.getState(), activeId, json) });
      } catch (err) {
        await showError(`Failed to save: ${err}`);
      }
    } else if (isTauriEnvironment()) {
      // Geen (native) pad — bv. een import uit .xls/.xtb: NOOIT het
      // bronbestand overschrijven met OCS-JSON, maar Opslaan-als tonen
      // met .ifcCalc als standaard.
      const defaultPath = toIfcCalcPath(doc.filePath, doc.fileName);
      try {
        const savedPath = await saveFileAsNative(json, defaultPath);
        if (savedPath) {
          updateDocument(activeId, {
            filePath: savedPath,
            fileName: fileNameFromPath(savedPath),
            isModified: documentChangedSince(useAppStore.getState(), activeId, json),
          });
          addToRecentFiles(savedPath);
        }
      } catch (err) {
        await showError(`Failed to save: ${err}`);
      }
    } else {
      // Browser fallback
      browserDownload(json, doc.fileName || 'begroting');
      updateDocument(activeId, { isModified: false });
    }
  }, [updateDocument, addToRecentFiles]);

  // ─── SAVE AS (always show dialog) ───
  const saveFileAs = useCallback(async () => {
    // Always read the freshest active tab from the store — avoids stale closures
    // where the destructured `schedule` / `documents` could lag behind a tab switch.
    const state = useAppStore.getState();
    const activeId = state.activeDocumentId;
    const doc = state.documents.find((d) => d.id === activeId);
    if (!doc) return;

    // Zelfde serialisatie als de controle op wijzigingen: met de aanmaakdatum
    // van het bestand en het actieve spreadsheet (knownbugs 110, 111).
    const json = serializeDocument(state, doc);
    // Prefer the active tab's folder + filename, but always with .ifcCalc als
    // standaardformaat — ook als het document uit een import (.xls/.xtb/…)
    // komt. Opslaan-als schrijft immers altijd het native OCS-formaat.
    const defaultPath = toIfcCalcPath(doc.filePath, doc.fileName);

    if (getSiteHost()) {
      try { await saveHostedFile(activeId, true); } catch (err) { await showError(`Failed to save: ${err instanceof Error ? err.message : JSON.stringify(err)}`); }
      return;
    }
    if (isTauriEnvironment()) {
      try {
        const savedPath = await saveFileAsNative(json, defaultPath);
        if (savedPath) {
          updateDocument(activeId, {
            filePath: savedPath,
            fileName: fileNameFromPath(savedPath),
            isModified: documentChangedSince(useAppStore.getState(), activeId, json),
          });
          addToRecentFiles(savedPath);
        }
      } catch (err) {
        await showError(`Failed to save: ${err}`);
      }
    } else {
      browserDownload(json, doc.fileName || 'begroting');
      updateDocument(activeId, { isModified: false });
    }
  }, [updateDocument, addToRecentFiles]);

  // ─── OPEN FILE ───
  const openFile = useCallback(async () => {
    if (getSiteHost()) {
      try { const file = await pickHostFile(); if (file) await openHostedFile(file.id, file.version); }
      catch (err) { await showError(`Failed to open: ${err instanceof Error ? err.message : String(err)}`); }
      return;
    }
    if (isTauriEnvironment()) {
      try {
        const result = await openFileNative();
        if (!result) return; // cancelled
        await openDesktopFile(result.path, result.content === '__BINARY__' ? undefined : result.content);
        addToRecentFiles(result.path);
      } catch (err) {
        if (isImportCancelled(err)) return;
        await showError(`Failed to open file: ${err}`);
      }
    } else {
      openFileBrowser();
    }
  }, [addToRecentFiles]);

  // ─── OPEN RECENT FILE ───
  const openRecentFile = useCallback(async (filePath: string) => {
    if (filePath.startsWith(HOST_RECENT_PREFIX)) {
      try { await openHostedFile(decodeURIComponent(filePath.slice(HOST_RECENT_PREFIX.length))); }
      catch (err) { await showError(`Failed to open: ${err instanceof Error ? err.message : String(err)}`); }
      return;
    }
    if (!isTauriEnvironment()) return;
    try {
      await openDesktopFile(filePath);
      addToRecentFiles(filePath);
    } catch (err) {
      if (isImportCancelled(err)) return;
      // Remove invalid path from recent files
      const current = settings.recentFiles ?? [];
      updateSettings({ recentFiles: current.filter((p: string) => p !== filePath) });
      await showError(uiText('files.openFailed', 'Cannot open file: {{error}}', { error: String(err) }));
    }
  }, [addToRecentFiles, settings.recentFiles, updateSettings]);

  // ─── Browser fallbacks ───
  function browserDownload(json: string, name: string) {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = toIfcCalcPath(null, name);
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Mobile browsers may start the download after the click handler returns.
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  function openFileBrowser() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.ifcCalc,.ifcx,.ocs,.json,.calc,.mdb,.xls,.xlsx,.xtb,.rsx,.dnc,.bc3,.onlv,.onlb';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('cancel', () => input.remove(), { once: true });
    input.onchange = async (e) => {
      input.remove();
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        // Import-formaten (binair én tekst) via de geregistreerde importeurs.
        const imp = useAppStore.getState().extensionImporters.find(
          i => i.fileExtensions.some(fe => fe.replace(/^\./, '') === ext),
        );
        if (imp) {
          const importResult = await imp.handler(file);
          const id = crypto.randomUUID();
          addDocument({ id, filePath: null, fileName: file.name.replace(/\.[^.]+$/, ''), isModified: false, items: importResult.items, schedule: importResult.schedule });
          if (importResult.companyInfo) setCompanyInfo(importResult.companyInfo);
          showImportWarnings(importResult, file.name);
          return;
        }
        const fileName = file.name.replace(/\.(ifcCalc|ifcx|ocs|json)$/i, '');
        openProjectJson(await file.text(), fileName);
      } catch (err) {
        if (isImportCancelled(err)) return;
        await showError(`Failed to open file: ${err}`);
      }
    };
    input.click();
  }

  return { newFile, saveFile, saveFileAs, openFile, openRecentFile };
}
