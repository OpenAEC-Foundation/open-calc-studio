import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/state/appStore';
import { serializeProject, deserializeProject } from '@/services/file/fileService';
import {
  isTauriEnvironment,
  openFileNative,
  saveFileAsNative,
  saveFileToPath,
  showError,
} from '@/services/file/nativeFileService';

function fileNameFromPath(filePath: string): string {
  const segments = filePath.replace(/\\/g, '/').split('/');
  const fullName = segments[segments.length - 1];
  return fullName.replace(/\.(ifcx|json)$/i, '');
}

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

export function useFileOperations() {
  const { t } = useTranslation();
  const {
    updateDocument,
    setCompanyInfo,
    setSubSheets,
    addDocument,
    settings, updateSettings,
    setOfferte,
    setProjectInfo,
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
    addDocument({ id, filePath: null, fileName, isModified: false });
  }, [addDocument, t]);

  // ─── SAVE (to existing path, or delegate to Save As) ───
  const saveFile = useCallback(async () => {
    // Always read the freshest active tab from the store to avoid stale closures.
    const state = useAppStore.getState();
    const activeId = state.activeDocumentId;
    const doc = state.documents.find((d) => d.id === activeId);
    if (!doc) return;

    const scheduleWithProjectInfo = { ...state.schedule, projectInfo: state.projectInfo };
    const json = serializeProject(scheduleWithProjectInfo, state.items, state.companyInfo, state.subSheets, state.offerte);

    if (doc.filePath && isTauriEnvironment()) {
      try {
        await saveFileToPath(doc.filePath, json);
        updateDocument(activeId, { isModified: false });
      } catch (err) {
        await showError(`Failed to save: ${err}`);
      }
    } else if (isTauriEnvironment()) {
      // No path yet → Save As. Prefer the active tab's own fileName.
      const defaultPath = doc.filePath ?? `${doc.fileName || 'begroting'}.ifcCalc`;
      try {
        const savedPath = await saveFileAsNative(json, defaultPath);
        if (savedPath) {
          updateDocument(activeId, {
            filePath: savedPath,
            fileName: fileNameFromPath(savedPath),
            isModified: false,
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

    const scheduleWithProjectInfo = { ...state.schedule, projectInfo: state.projectInfo };
    const json = serializeProject(scheduleWithProjectInfo, state.items, state.companyInfo, state.subSheets, state.offerte);
    // Prefer the active tab's full filePath so the dialog opens in the right folder
    // with the right filename. Falls back to the tab's fileName (never another tab's name).
    const defaultPath = doc.filePath ?? `${doc.fileName || 'begroting'}.ifcCalc`;

    if (isTauriEnvironment()) {
      try {
        const savedPath = await saveFileAsNative(json, defaultPath);
        if (savedPath) {
          updateDocument(activeId, {
            filePath: savedPath,
            fileName: fileNameFromPath(savedPath),
            isModified: false,
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
    if (isTauriEnvironment()) {
      try {
        const result = await openFileNative();
        if (!result) return; // cancelled

        const ext = result.path.split('.').pop()?.toLowerCase() || '';
        const fileName = fileNameFromPath(result.path);

        // Binary import formats: .calc, .mdb, .xls, .xlsx, .xtb, .dnc
        if (['calc', 'mdb', 'xls', 'xlsx', 'xtb', 'dnc'].includes(ext)) {
          const { readBinaryFileByPath } = await import('@/services/file/nativeFileService');
          const data = await readBinaryFileByPath(result.path);

          // Inhoud-sniff: een .calc/.mdb met JSON-inhoud is een native OCS-project
          const native = sniffNativeProject(data);
          if (native) {
            const id = crypto.randomUUID();
            addDocument({ id, filePath: result.path, fileName: fileName.replace(/\.[^.]+$/, ''), isModified: false, items: native.items, schedule: native.schedule });
            if (native.companyInfo) setCompanyInfo(native.companyInfo);
            if (native.subSheets) setSubSheets(native.subSheets);
            if (native.offerte) setOfferte(native.offerte);
            if (native.schedule.projectInfo) setProjectInfo(native.schedule.projectInfo);
            addToRecentFiles(result.path);
            return;
          }

          // Find the matching extension importer
          const store = useAppStore.getState();
          const importers = store.extensionImporters;
          const imp = importers.find(i => i.fileExtensions.some(fe => fe.replace(/^\./, '') === ext));
          if (!imp) { await showError(`Geen importer gevonden voor .${ext} bestanden`); return; }

          const file = new File([data], fileName);
          const importResult = await imp.handler(file);

          const id = crypto.randomUUID();
          addDocument({ id, filePath: result.path, fileName: fileName.replace(/\.[^.]+$/, ''), isModified: false, items: importResult.items, schedule: importResult.schedule });
          if (importResult.companyInfo) setCompanyInfo(importResult.companyInfo);
          addToRecentFiles(result.path);
          return;
        }

        // Text import: .rsx
        if (ext === 'rsx') {
          const store = useAppStore.getState();
          const imp = store.extensionImporters.find(i => i.fileExtensions.some(fe => fe.replace(/^\./, '') === 'rsx'));
          if (!imp) { await showError('Geen importer gevonden voor .rsx bestanden'); return; }

          const file = new File([result.content], fileName, { type: 'text/plain' });
          const importResult = await imp.handler(file);

          const id = crypto.randomUUID();
          addDocument({ id, filePath: result.path, fileName: fileName.replace(/\.[^.]+$/, ''), isModified: false, items: importResult.items, schedule: importResult.schedule });
          if (importResult.companyInfo) setCompanyInfo(importResult.companyInfo);
          addToRecentFiles(result.path);
          return;
        }

        // Native format: .ifcx, .json
        const parsed = deserializeProject(result.content);
        const id = crypto.randomUUID();

        addDocument({ id, filePath: result.path, fileName, isModified: false, items: parsed.items, schedule: parsed.schedule });
        if (parsed.companyInfo) setCompanyInfo(parsed.companyInfo);
        if (parsed.subSheets) setSubSheets(parsed.subSheets);
        if (parsed.offerte) setOfferte(parsed.offerte);
        if (parsed.schedule.projectInfo) setProjectInfo(parsed.schedule.projectInfo);
        addToRecentFiles(result.path);
      } catch (err) {
        await showError(`Failed to open file: ${err}`);
      }
    } else {
      openFileBrowser();
    }
  }, [addDocument, setCompanyInfo, setSubSheets, setOfferte, setProjectInfo, addToRecentFiles]);

  // ─── OPEN RECENT FILE ───
  const openRecentFile = useCallback(async (filePath: string) => {
    if (!isTauriEnvironment()) return;
    try {
      const ext = filePath.split('.').pop()?.toLowerCase() || '';
      const fileName = fileNameFromPath(filePath);

      // Binary import formats: .calc, .mdb, .xls, .xlsx, .xtb
      if (['calc', 'mdb', 'xls', 'xlsx', 'xtb'].includes(ext)) {
        const { readBinaryFileByPath } = await import('@/services/file/nativeFileService');
        const data = await readBinaryFileByPath(filePath);

        // Inhoud-sniff: een .calc/.mdb met JSON-inhoud is een native OCS-project
        const native = sniffNativeProject(data);
        if (native) {
          const id = crypto.randomUUID();
          addDocument({ id, filePath, fileName: fileName.replace(/\.[^.]+$/, ''), isModified: false, items: native.items, schedule: native.schedule });
          if (native.companyInfo) setCompanyInfo(native.companyInfo);
          if (native.subSheets) setSubSheets(native.subSheets);
          if (native.offerte) setOfferte(native.offerte);
          if (native.schedule.projectInfo) setProjectInfo(native.schedule.projectInfo);
          addToRecentFiles(filePath);
          return;
        }

        const store = useAppStore.getState();
        const importers = store.extensionImporters;
        const imp = importers.find(i => i.fileExtensions.some(fe => fe.replace(/^\./, '') === ext));
        if (!imp) { await showError(`Geen importer gevonden voor .${ext} bestanden`); return; }

        const file = new File([data], fileName);
        const importResult = await imp.handler(file);

        const id = crypto.randomUUID();
        addDocument({ id, filePath, fileName: fileName.replace(/\.[^.]+$/, ''), isModified: false, items: importResult.items, schedule: importResult.schedule });
        if (importResult.companyInfo) setCompanyInfo(importResult.companyInfo);
        addToRecentFiles(filePath);
        return;
      }

      // Text import: .rsx
      if (ext === 'rsx') {
        const { readTextFile } = await import('@tauri-apps/plugin-fs');
        const content = await readTextFile(filePath);
        const store = useAppStore.getState();
        const imp = store.extensionImporters.find(i => i.fileExtensions.some(fe => fe.replace(/^\./, '') === 'rsx'));
        if (!imp) { await showError('Geen importer gevonden voor .rsx bestanden'); return; }

        const file = new File([content], fileName, { type: 'text/plain' });
        const importResult = await imp.handler(file);

        const id = crypto.randomUUID();
        addDocument({ id, filePath, fileName: fileName.replace(/\.[^.]+$/, ''), isModified: false, items: importResult.items, schedule: importResult.schedule });
        if (importResult.companyInfo) setCompanyInfo(importResult.companyInfo);
        addToRecentFiles(filePath);
        return;
      }

      // Native format: .ifcx, .json
      const { readTextFile } = await import('@tauri-apps/plugin-fs');
      const content = await readTextFile(filePath);
      const parsed = deserializeProject(content);
      const id = crypto.randomUUID();

      addDocument({ id, filePath, fileName, isModified: false, items: parsed.items, schedule: parsed.schedule });
      if (parsed.companyInfo) setCompanyInfo(parsed.companyInfo);
      if (parsed.subSheets) setSubSheets(parsed.subSheets);
      if (parsed.offerte) setOfferte(parsed.offerte);
      if (parsed.schedule.projectInfo) setProjectInfo(parsed.schedule.projectInfo);
      addToRecentFiles(filePath);
    } catch (err) {
      // Remove invalid path from recent files
      const current = settings.recentFiles ?? [];
      updateSettings({ recentFiles: current.filter((p: string) => p !== filePath) });
      await showError(`Kan bestand niet openen: ${err}`);
    }
  }, [addDocument, setCompanyInfo, setSubSheets, setOfferte, setProjectInfo, addToRecentFiles, settings.recentFiles, updateSettings]);

  // ─── Browser fallbacks ───
  function browserDownload(json: string, name: string) {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}.ifcCalc`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function openFileBrowser() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.ifcCalc,.ifcx,.ocs,.json,.calc,.mdb,.xls,.xlsx,.xtb,.rsx,.dnc';
    input.onchange = async (e) => {
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
          return;
        }
        // Native formaat (.ifcCalc/.ifcx/.ocs/.json)
        const parsed = deserializeProject(await file.text());
        const id = crypto.randomUUID();
        const fileName = file.name.replace(/\.(ifcCalc|ifcx|ocs|json)$/i, '');
        addDocument({ id, filePath: null, fileName, isModified: false, items: parsed.items, schedule: parsed.schedule });
        if (parsed.companyInfo) setCompanyInfo(parsed.companyInfo);
        if (parsed.subSheets) setSubSheets(parsed.subSheets);
        if (parsed.offerte) setOfferte(parsed.offerte);
        if (parsed.schedule.projectInfo) setProjectInfo(parsed.schedule.projectInfo);
      } catch (err) {
        await showError(`Failed to open file: ${err}`);
      }
    };
    input.click();
  }

  return { newFile, saveFile, saveFileAs, openFile, openRecentFile };
}
