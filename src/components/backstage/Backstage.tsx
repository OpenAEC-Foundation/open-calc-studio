import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "../../state/appStore";
import { useFileOperations } from "../../hooks/useFileOperations";
import { generateIfcCostFile } from "../../services/ifc/ifcCostGenerator";
import { parseIfcCostFile } from "../../services/ifc/ifcCostParser";
import { importIfcx } from "../../services/importers/ifcxImporter";
import { recalculateItems } from "../../services/calculation/calculator";
import { exportInschrijfstaatAsync } from "../../services/export/inschrijfstaatExporter";
import { exportWpCalcFile } from "../../services/export/wpcalcExporter";
import { printBudget } from "../../services/print/printService";
import { isTauriEnvironment } from "../../services/file/nativeFileService";
import {
  importCuf, importTradxml, importRsx, importRsu, importZsx, importNsx, importS01, importSufx, importBmecat,
  parseCsv, parseXlsxTabular, buildFromMapping,
  type ImportResult, type TabularData, type ColumnMapping,
} from "../../services/importers";
import { exportCuf, exportTradxml, exportRsx, type ExportInput, type ExportResult } from "../../services/exporters";
import ExtensionManagerPanel from "./ExtensionManagerPanel";
import { CloudPanel } from "./CloudPanel";
import ColumnMappingDialog from "./ColumnMappingDialog";
import { OPENAEC_ENABLED } from "../../services/buildFlags";
import "./Backstage.css";

const ICONS = {
  new: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M12 18v-6m-3 3h6"/></svg>',
  open: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>',
  cloud: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 116.71-9h1.79a4.5 4.5 0 110 9z"/></svg>',
  save: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V7l-4-4z"/><path d="M17 3v4a1 1 0 01-1 1H8"/><path d="M7 14h10v7H7z"/></svg>',
  import: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  export: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
  print: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>',
  preferences: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>',
  about: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
  exit: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
  extensions: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>',
};

function MenuItem({ icon, label, shortcut, active, onClick }: {
  icon: string; label: string; shortcut?: string; active?: boolean; onClick: () => void;
}) {
  return (
    <button className={`backstage-item${active ? " active" : ""}`} onClick={onClick}>
      <span className="backstage-item-icon" dangerouslySetInnerHTML={{ __html: icon }} />
      <span className="backstage-item-label">{label}</span>
      {shortcut && <span className="backstage-item-shortcut">{shortcut}</span>}
    </button>
  );
}

function Divider() {
  return <div className="backstage-divider" />;
}

interface BackstageProps {
  open: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
}

export default function Backstage({ open, onClose, onOpenSettings }: BackstageProps) {
  const { t } = useTranslation("backstage");
  const [activePanel, setActivePanel] = useState<string>("none");
  const [visible, setVisible] = useState(false);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    if (open) {
      setVisible(true);
      // Double rAF to ensure the DOM has rendered before triggering the transition
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setAnimating(true));
      });
    } else if (visible) {
      setAnimating(false);
      const timer = setTimeout(() => setVisible(false), 300);
      return () => clearTimeout(timer);
    }
  }, [open]);
  const { newFile, saveFile, saveFileAs, openFile, openRecentFile } = useFileOperations();
  const {
    schedule, items, companyInfo, offerte, settings,
  } = useAppStore();
  const allExtensionImporters = useAppStore((s) => s.extensionImporters);
  const installedExtensions = useAppStore((s) => s.installedExtensions);
  // Only show importers for enabled extensions
  const extensionImporters = useMemo(
    () => allExtensionImporters.filter((imp) => {
      const ext = installedExtensions[imp.extensionId];
      return ext && ext.status === 'enabled';
    }),
    [allExtensionImporters, installedExtensions]
  );

  const actionAndClose = useCallback(
    (fn?: () => void) => { onClose(); fn?.(); },
    [onClose]
  );


  // Paneel-default alléén bij het open-gaan zetten. Niet samenvoegen met het
  // keydown-effect hieronder: dat heeft onClose als dependency en her-runt bij
  // elke parent-render — dan springt het actieve paneel telkens terug naar
  // "open" zodra iets in de store wijzigt (bv. het cloud-paneel dat laadt).
  useEffect(() => {
    if (!open) { setActivePanel("none"); return; }
    // Default to "open" panel when backstage opens if there are recent files
    if ((settings.recentFiles?.length ?? 0) > 0) {
      setActivePanel("open");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  const handleImportIfc = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.ifc,.ifcx';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const content = reader.result as string;
        // .ifcx is JSON (IfcX-alpha), .ifc is STEP — kies op extensie/inhoud.
        const isIfcx = /\.ifcx$/i.test(file.name) || content.trimStart().startsWith('{');
        const { schedule: s, items: i } = isIfcx ? importIfcx(content) : parseIfcCostFile(content);
        newFile();
        const store = useAppStore.getState();
        store.setSchedule(s);
        store.setItems(recalculateItems(i));
        store.updateDocument(store.activeDocumentId, {
          fileName: file.name.replace(/\.ifcx?$/i, ''),
          isModified: true,
        });
      };
      reader.readAsText(file);
    };
    input.click();
    onClose();
  }, [newFile, onClose]);

  const handleExtensionImport = useCallback(async (importerId: string) => {
    const imp = extensionImporters.find((i) => i.id === importerId);
    if (!imp) return;
    onClose();

    // Helper: after handler returns data, load it into the app
    const loadImportResult = (result: { schedule: any; items: any; companyInfo?: any }, fileName: string) => {
      // First create a new document via newFile so everything is properly initialized
      newFile();
      // Now set the imported data
      const store = useAppStore.getState();
      store.setSchedule(result.schedule);
      store.setItems(result.items);
      if (result.companyInfo) store.setCompanyInfo(result.companyInfo);
      store.updateDocument(store.activeDocumentId, {
        fileName,
        isModified: true,
      });
    };

    try {
      if (isTauriEnvironment()) {
        const extensions = imp.fileExtensions.map(e => e.replace(/^\./, ''));
        const { openBinaryFileNative, openTextFileNative } = await import('../../services/file/nativeFileService');
        const isText = extensions.some(e => ['rsx', 'xml', 'txt'].includes(e));

        if (isText) {
          const res = await openTextFileNative(imp.name, extensions);
          if (!res) return;
          const file = new File([res.content], res.path.split(/[\\/]/).pop() || 'import', { type: 'text/plain' });
          const result = await imp.handler(file);
          const name = (res.path.split(/[\\/]/).pop() || '').replace(/\.[^.]+$/, '');
          loadImportResult(result, name);
        } else {
          const res = await openBinaryFileNative(imp.name, extensions);
          if (!res) return;
          const name = (res.path.split(/[\\/]/).pop() || '').replace(/\.[^.]+$/, '');
          const file = new File([res.data], name);
          const result = await imp.handler(file);
          loadImportResult(result, name);
        }
      } else {
        // Browser fallback
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = imp.fileExtensions.join(',');
        input.onchange = async (e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (!file) return;
          try {
            const result = await imp.handler(file);
            const name = file.name.replace(/\.[^.]+$/, '');
            loadImportResult(result, name);
          } catch (err: any) {
            console.error(`[Import] ${imp.name} failed:`, err);
            alert(`Import mislukt: ${err?.message || err}`);
          }
        };
        input.click();
      }
    } catch (err: any) {
      console.error(`[Import] ${imp.name} failed:`, err);
      alert(`Import mislukt: ${err?.message || err}`);
    }
  }, [extensionImporters, newFile, onClose]);

  const handleZsxImport = useCallback(async () => {
    onClose();
    const applyResult = (xml: string, fileName: string) => {
      try {
        const result = importZsx(xml);
        if (result.resources.length === 0) {
          alert(`ZSX bevat geen middelen (${fileName}).`);
          return;
        }
        const store = useAppStore.getState();
        const current = store.resourceLibrary;
        // Merge by code: incoming entries with a matching code replace the
        // existing library entry; new codes are appended.
        const byCode = new Map(current.map((r) => [r.code, r]));
        for (const r of result.resources) {
          byCode.set(r.code, r);
        }
        store.setResourceLibrary(Array.from(byCode.values()));
        if (result.warnings.length > 0) {
          console.warn(`[Import ZSX] ${result.warnings.length} waarschuwingen:`, result.warnings);
        }
        console.log(`[Import ZSX] ${result.resources.length} middelen geladen uit ${fileName}`);
      } catch (err: any) {
        console.error('[Import ZSX] failed:', err);
        alert(`Import mislukt: ${err?.message || err}`);
      }
    };

    try {
      if (isTauriEnvironment()) {
        const { openTextFileNative } = await import('../../services/file/nativeFileService');
        const res = await openTextFileNative('Prijslijst (ZSX)', ['zsx', 'xml']);
        if (!res) return;
        const baseName = (res.path.split(/[\\/]/).pop() || 'import');
        applyResult(res.content, baseName);
      } else {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.zsx,.xml';
        input.onchange = async (e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (!file) return;
          const xml = await file.text();
          applyResult(xml, file.name);
        };
        input.click();
      }
    } catch (err: any) {
      console.error('[Import ZSX] failed:', err);
      alert(`Import mislukt: ${err?.message || err}`);
    }
  }, [onClose]);

  const handleNsxImport = useCallback(async () => {
    onClose();
    const applyResult = (xml: string, fileName: string) => {
      try {
        const result = importNsx(xml);
        if (result.norms.length === 0) {
          alert(`NSX bevat geen normen (${fileName}).`);
          return;
        }
        // NOTE: no norms slice yet — v0.7.0 follow-up will persist these into
        // the resource library. For now we log + show a status dialog.
        console.log(`[Import NSX] ${result.norms.length} normen geladen uit ${fileName}`, result);
        if (result.warnings.length > 0) {
          console.warn(`[Import NSX] ${result.warnings.length} waarschuwingen:`, result.warnings);
        }
        alert(`Geïmporteerd: ${result.norms.length} normen (nog niet opgeslagen — integratie volgt in v0.7.0).`);
      } catch (err: any) {
        console.error('[Import NSX] failed:', err);
        alert(`Import mislukt: ${err?.message || err}`);
      }
    };

    try {
      if (isTauriEnvironment()) {
        const { openTextFileNative } = await import('../../services/file/nativeFileService');
        const res = await openTextFileNative('Normenbestand (NSX)', ['nsx', 'xml']);
        if (!res) return;
        const baseName = (res.path.split(/[\\/]/).pop() || 'import');
        applyResult(res.content, baseName);
      } else {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.nsx,.xml';
        input.onchange = async (e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (!file) return;
          const xml = await file.text();
          applyResult(xml, file.name);
        };
        input.click();
      }
    } catch (err: any) {
      console.error('[Import NSX] failed:', err);
      alert(`Import mislukt: ${err?.message || err}`);
    }
  }, [onClose]);

  // ── Generieke Excel/CSV-import met kolom-mapping ──
  const [mappingData, setMappingData] = useState<TabularData | null>(null);

  const handleGenericImport = useCallback(async () => {
    const extensions = ['xlsx', 'xls', 'csv'];
    try {
      if (isTauriEnvironment()) {
        const { openBinaryFileNative } = await import('../../services/file/nativeFileService');
        const res = await openBinaryFileNative('Excel/CSV', extensions);
        if (!res) return;
        const fileName = res.path.split(/[\\/]/).pop() || 'import';
        const base = fileName.replace(/\.[^.]+$/, '');
        const bytes = res.data instanceof Uint8Array ? res.data : new Uint8Array(res.data);
        const data = /\.csv$/i.test(fileName)
          ? parseCsv(new TextDecoder().decode(bytes), base)
          : parseXlsxTabular(bytes, base);
        if (data.headers.length === 0) { alert('Geen kolommen gevonden in het bestand.'); return; }
        setMappingData(data);
      } else {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.xlsx,.xls,.csv';
        input.onchange = async (e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (!file) return;
          const base = file.name.replace(/\.[^.]+$/, '');
          const data = /\.csv$/i.test(file.name)
            ? parseCsv(await file.text(), base)
            : parseXlsxTabular(await file.arrayBuffer(), base);
          if (data.headers.length === 0) { alert('Geen kolommen gevonden in het bestand.'); return; }
          setMappingData(data);
        };
        input.click();
      }
    } catch (err: any) {
      console.error('[Import Excel/CSV] failed:', err);
      alert(`Import mislukt: ${err?.message || err}`);
    }
  }, []);

  const handleMappingConfirm = useCallback((mapping: ColumnMapping) => {
    if (!mappingData) return;
    const result = buildFromMapping(mappingData, mapping);
    newFile();
    const store = useAppStore.getState();
    store.setSchedule(result.schedule);
    store.setItems(recalculateItems(result.items));
    store.updateDocument(store.activeDocumentId, { fileName: mappingData.sourceName, isModified: true });
    if (result.warnings.length > 0) console.warn('[Import Excel/CSV] waarschuwingen:', result.warnings);
    setMappingData(null);
    onClose();
  }, [mappingData, newFile, onClose]);

  const handleBmecatImport = useCallback(async () => {
    onClose();
    const applyResult = (xml: string, fileName: string) => {
      try {
        const result = importBmecat(xml);
        if (result.resources.length === 0) { alert(`Geen middelen gevonden (${fileName}).`); return; }
        const store = useAppStore.getState();
        const byCode = new Map(store.resourceLibrary.map((r) => [r.code, r]));
        for (const r of result.resources) byCode.set(r.code, r);
        store.setResourceLibrary(Array.from(byCode.values()));
        if (result.warnings.length > 0) console.warn('[Import BMEcat] waarschuwingen:', result.warnings);
        console.log(`[Import BMEcat] ${result.resources.length} middelen geladen uit ${fileName}`);
      } catch (err: any) {
        console.error('[Import BMEcat] failed:', err);
        alert(`Import mislukt: ${err?.message || err}`);
      }
    };
    try {
      if (isTauriEnvironment()) {
        const { openTextFileNative } = await import('../../services/file/nativeFileService');
        const res = await openTextFileNative('BMEcat/DICO prijscatalogus', ['xml', 'bmecat']);
        if (!res) return;
        applyResult(res.content, res.path.split(/[\\/]/).pop() || 'import');
      } else {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.xml,.bmecat';
        input.onchange = async (e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (!file) return;
          applyResult(await file.text(), file.name);
        };
        input.click();
      }
    } catch (err: any) {
      console.error('[Import BMEcat] failed:', err);
      alert(`Import mislukt: ${err?.message || err}`);
    }
  }, [onClose]);

  const handleXmlImport = useCallback(
    async (
      formatLabel: string,
      extensions: string[],
      run: (xml: string) => ImportResult,
    ) => {
      onClose();
      const loadResult = (result: ImportResult, fileName: string) => {
        newFile();
        const store = useAppStore.getState();
        store.setSchedule(result.schedule);
        store.setItems(recalculateItems(result.items));
        store.updateDocument(store.activeDocumentId, {
          fileName,
          isModified: true,
        });
        if (result.warnings.length > 0) {
          console.warn(`[Import ${formatLabel}] ${result.warnings.length} waarschuwingen:`, result.warnings);
        }
      };

      try {
        if (isTauriEnvironment()) {
          const { openTextFileNative } = await import('../../services/file/nativeFileService');
          const res = await openTextFileNative(formatLabel, extensions);
          if (!res) return;
          const baseName = (res.path.split(/[\\/]/).pop() || 'import').replace(/\.[^.]+$/, '');
          const result = run(res.content);
          loadResult(result, baseName);
        } else {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = extensions.map((e) => `.${e}`).join(',');
          input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;
            try {
              const xml = await file.text();
              const result = run(xml);
              loadResult(result, file.name.replace(/\.[^.]+$/, ''));
            } catch (err: any) {
              console.error(`[Import ${formatLabel}] failed:`, err);
              alert(`Import mislukt: ${err?.message || err}`);
            }
          };
          input.click();
        }
      } catch (err: any) {
        console.error(`[Import ${formatLabel}] failed:`, err);
        alert(`Import mislukt: ${err?.message || err}`);
      }
    },
    [newFile, onClose],
  );

  if (!visible) return null;

  const handleExportIfc = () => {
    const ifc = generateIfcCostFile(schedule, items, offerte);
    const blob = new Blob([ifc], { type: 'application/x-step' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${schedule.name || 'begroting'}.ifc`;
    a.click();
    URL.revokeObjectURL(url);
    onClose();
  };

  const handleExportInschrijfstaat = async () => {
    try {
      const blob = await exportInschrijfstaatAsync(schedule, items, companyInfo);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${schedule.name || 'inschrijfstaat'}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[Export] Inschrijfstaat failed:', err);
    }
    onClose();
  };

  const handleXmlExport = async (
    format: 'cuf' | 'tradxml' | 'rsx',
    formatLabel: string,
  ) => {
    onClose();
    const ext = format === 'rsx' ? 'rsx' : format === 'tradxml' ? 'xml' : 'cuf';
    const baseName = (schedule.projectName || schedule.name || 'begroting').replace(/\.(ifcCalc|ifcx|ocs)$/i, '');
    const defaultPath = `${baseName}.${ext}`;

    const input: ExportInput = { schedule, items };
    let result: ExportResult;
    try {
      result =
        format === 'cuf' ? exportCuf(input) :
        format === 'tradxml' ? exportTradxml(input) :
        exportRsx(input);
    } catch (err: any) {
      console.error(`[Export ${formatLabel}] failed:`, err);
      alert(`Export mislukt: ${err?.message || err}`);
      return;
    }

    try {
      if (isTauriEnvironment()) {
        const { save } = await import('@tauri-apps/plugin-dialog');
        const { writeTextFile } = await import('@tauri-apps/plugin-fs');
        const picked = await save({
          defaultPath,
          filters: [{ name: formatLabel, extensions: [ext] }],
        });
        if (!picked) return;
        await writeTextFile(picked as string, result.xml);
      } else {
        const blob = new Blob([result.xml], { type: 'application/xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = defaultPath;
        a.click();
        URL.revokeObjectURL(url);
      }
      if (result.warnings.length > 0) {
        console.warn(`[Export ${formatLabel}] ${result.warnings.length} waarschuwingen:`, result.warnings);
      }
    } catch (err: any) {
      console.error(`[Export ${formatLabel}] failed:`, err);
      alert(`Export mislukt: ${err?.message || err}`);
    }
  };

  const handleExportWpCalc = async () => {
    try {
      const result = await exportWpCalcFile(schedule, items, companyInfo);
      if (result) {
        console.log('[Export] WPCalc saved to:', result);
      }
    } catch (err: any) {
      console.error('[Export] WPCalc failed:', err);
      alert(`WPCalc export mislukt: ${err?.message || err}`);
    }
    onClose();
  };

  return (
    <div
      className={`backstage-overlay${animating ? ' backstage-open' : ''}${activePanel !== 'none' ? ' has-panel' : ''}`}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="backstage-sidebar">
        <button className="backstage-back" onClick={onClose}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          <span>{t("file")}</span>
        </button>
        <div className="backstage-items">
          <MenuItem icon={ICONS.new} label={t("new")} shortcut="Ctrl+N" onClick={() => actionAndClose(newFile)} />
          <MenuItem icon={ICONS.open} label={t("open")} shortcut="Ctrl+O" active={activePanel === "open"} onClick={() => setActivePanel("open")} />
          <MenuItem icon={ICONS.save} label={t("save")} shortcut="Ctrl+S" onClick={() => { onClose(); void saveFile(); }} />
          <MenuItem icon={ICONS.save} label={t("saveAs")} shortcut="Ctrl+Shift+S" onClick={() => { onClose(); void saveFileAs(); }} />
          <Divider />
          <MenuItem icon={ICONS.print} label={t("printMenu")} shortcut="Ctrl+P" onClick={() => { printBudget(schedule, items, 'hoofdaanneming'); onClose(); }} />
          <Divider />
          <MenuItem icon={ICONS.import} label={t("import")} active={activePanel === "import"} onClick={() => setActivePanel("import")} />
          <MenuItem icon={ICONS.export} label={t("export")} active={activePanel === "export"} onClick={() => setActivePanel("export")} />
          {OPENAEC_ENABLED && (
            <MenuItem icon={ICONS.cloud} label="OpenAEC Cloud" active={activePanel === "cloud"} onClick={() => setActivePanel("cloud")} />
          )}
          <Divider />
          <MenuItem icon={ICONS.extensions} label={t("extensions")} active={activePanel === "extensions"} onClick={() => setActivePanel("extensions")} />
          <Divider />
          <MenuItem icon={ICONS.preferences} label={t("preferences")} shortcut="Ctrl+," onClick={() => actionAndClose(onOpenSettings)} />
          <Divider />
          <MenuItem icon={ICONS.about} label={t("about")} active={activePanel === "about"} onClick={() => setActivePanel("about")} />
          <Divider />
          <MenuItem icon={ICONS.exit} label={t("exit")} shortcut="Alt+F4" onClick={() => {
            onClose();
            import("@tauri-apps/api/window").then(({ getCurrentWindow }) => getCurrentWindow().close()).catch(() => {});
          }} />
        </div>
      </div>
      <div className="backstage-content" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        {activePanel === "open" && (
          <div className="bs-panel">
            <h2 className="bs-panel-title">{t("open")}</h2>
            <div className="bs-panel-options">
              <button className="bs-panel-option" onClick={() => { onClose(); void openFile(); }}>
                <div className="bs-panel-option-icon" dangerouslySetInnerHTML={{ __html: ICONS.open }} />
                <div className="bs-panel-option-text">
                  <strong>{t("open")}</strong>
                  <span>Ctrl+O</span>
                </div>
              </button>
            </div>
            {(settings.recentFiles?.length ?? 0) > 0 && (
              <>
                <h3 className="bs-recent-title">{t("recentFiles")}</h3>
                <div className="bs-recent-list">
                  {settings.recentFiles.map((filePath) => {
                    const name = filePath.replace(/\\/g, '/').split('/').pop()?.replace(/\.(ifcx|json|ocs|calc)$/i, '') ?? filePath;
                    const dir = filePath.replace(/\\/g, '/').split('/').slice(0, -1).join('/');
                    return (
                      <button
                        key={filePath}
                        className="bs-recent-item"
                        onClick={() => { onClose(); void openRecentFile(filePath); }}
                        title={filePath}
                      >
                        <div className="bs-recent-item-icon">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>
                        </div>
                        <div className="bs-recent-item-text">
                          <span className="bs-recent-item-name">{name}</span>
                          <span className="bs-recent-item-path">{dir}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
        {activePanel === "about" && <AboutPanel />}
        {activePanel === "extensions" && <ExtensionManagerPanel />}
        {activePanel === "cloud" && <CloudPanel onClose={onClose} />}
        {activePanel === "import" && (
          <div className="bs-panel">
            <h2 className="bs-panel-title">{t("importPanel.title")}</h2>
            <div className="bs-panel-options">
              <button className="bs-panel-option" onClick={handleImportIfc}>
                <div className="bs-panel-option-icon" dangerouslySetInnerHTML={{ __html: ICONS.import }} />
                <div className="bs-panel-option-text">
                  <strong>{t("importPanel.fromTemplate")}</strong>
                  <span>{t("importPanel.fromTemplateDesc")}</span>
                </div>
              </button>
              <button
                className="bs-panel-option"
                onClick={() => void handleXmlImport('CUF-XML', ['cuf', 'xml'], importCuf)}
              >
                <div className="bs-panel-option-icon" dangerouslySetInnerHTML={{ __html: ICONS.import }} />
                <div className="bs-panel-option-text">
                  <strong>CUF-XML</strong>
                  <span>CUF-calculatiebestand 4.003 (.cuf/.xml)</span>
                </div>
              </button>
              <button
                className="bs-panel-option"
                onClick={() => void handleGenericImport()}
              >
                <div className="bs-panel-option-icon" dangerouslySetInnerHTML={{ __html: ICONS.import }} />
                <div className="bs-panel-option-text">
                  <strong>Excel / CSV</strong>
                  <span>Vrije kolomindeling — koppel zelf de kolommen (.xlsx/.csv)</span>
                </div>
              </button>
              <button
                className="bs-panel-option"
                onClick={() => void handleXmlImport('STABU-bestek', ['s01'], importS01)}
              >
                <div className="bs-panel-option-icon" dangerouslySetInnerHTML={{ __html: ICONS.import }} />
                <div className="bs-panel-option-text">
                  <strong>STABU-bestek</strong>
                  <span>STABU-uitwisselformaat als skelet-begroting (.s01)</span>
                </div>
              </button>
              <button
                className="bs-panel-option"
                onClick={() => void handleXmlImport('STABU SUFX', ['sufx', 'xml'], importSufx)}
              >
                <div className="bs-panel-option-icon" dangerouslySetInnerHTML={{ __html: ICONS.import }} />
                <div className="bs-panel-option-text">
                  <strong>STABU SUFX</strong>
                  <span>STABU Bouwbreed XML als skelet-begroting (.sufx)</span>
                </div>
              </button>
              <button
                className="bs-panel-option"
                onClick={() => void handleXmlImport('IBIS-TRAD XML', ['xml'], importTradxml)}
              >
                <div className="bs-panel-option-icon" dangerouslySetInnerHTML={{ __html: ICONS.import }} />
                <div className="bs-panel-option-text">
                  <strong>IBIS-TRAD XML</strong>
                  <span>IBIS Trad uitwisselformaat (.xml)</span>
                </div>
              </button>
              <button
                className="bs-panel-option"
                onClick={() => void handleXmlImport('RAW RSX', ['rsx', 'xml'], importRsx)}
              >
                <div className="bs-panel-option-icon" dangerouslySetInnerHTML={{ __html: ICONS.import }} />
                <div className="bs-panel-option-text">
                  <strong>RAW RSX (CROW GWW)</strong>
                  <span>CROW RAW besteks-uitwisseling (.rsx/.xml)</span>
                </div>
              </button>
              <button
                className="bs-panel-option"
                onClick={() => void handleXmlImport('RAW RSU (legacy)', ['rsu', 'xml'], importRsu)}
              >
                <div className="bs-panel-option-icon" dangerouslySetInnerHTML={{ __html: ICONS.import }} />
                <div className="bs-panel-option-text">
                  <strong>RAW RSU (legacy)</strong>
                  <span>Oudere RAW-uitwisseling (.rsu) — via de RSX-route</span>
                </div>
              </button>
              <button
                className="bs-panel-option"
                onClick={() => void handleZsxImport()}
              >
                <div className="bs-panel-option-icon" dangerouslySetInnerHTML={{ __html: ICONS.import }} />
                <div className="bs-panel-option-text">
                  <strong>Prijslijst (ZSX)</strong>
                  <span>Middelen importeren in resourcebibliotheek (.zsx/.xml)</span>
                </div>
              </button>
              <button
                className="bs-panel-option"
                onClick={() => void handleBmecatImport()}
              >
                <div className="bs-panel-option-icon" dangerouslySetInnerHTML={{ __html: ICONS.import }} />
                <div className="bs-panel-option-text">
                  <strong>Prijscatalogus (BMEcat/DICO)</strong>
                  <span>Groothandels-/ETIM-prijsdata in resourcebibliotheek (.xml)</span>
                </div>
              </button>
              <button
                className="bs-panel-option"
                onClick={() => void handleNsxImport()}
              >
                <div className="bs-panel-option-icon" dangerouslySetInnerHTML={{ __html: ICONS.import }} />
                <div className="bs-panel-option-text">
                  <strong>Normen (NSX)</strong>
                  <span>Normenbestand inlezen (.nsx/.xml) — opslag volgt in v0.7.0</span>
                </div>
              </button>
              {extensionImporters.map((imp) => (
                <button key={imp.id} className="bs-panel-option" onClick={() => handleExtensionImport(imp.id)}>
                  <div className="bs-panel-option-icon" dangerouslySetInnerHTML={{ __html: imp.icon || ICONS.import }} />
                  <div className="bs-panel-option-text">
                    <strong>{imp.name}</strong>
                    <span>{imp.description || ''}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
        {activePanel === "export" && (
          <div className="bs-panel">
            <h2 className="bs-panel-title">{t("exportPanel.title")}</h2>
            <div className="bs-panel-options">
              <button className="bs-panel-option" onClick={handleExportIfc}>
                <div className="bs-panel-option-icon" dangerouslySetInnerHTML={{ __html: ICONS.export }} />
                <div className="bs-panel-option-text">
                  <strong>{t("exportPanel.asHtml")}</strong>
                  <span>{t("exportPanel.asHtmlDesc")}</span>
                </div>
              </button>
              <button className="bs-panel-option" onClick={handleExportInschrijfstaat}>
                <div className="bs-panel-option-icon" dangerouslySetInnerHTML={{ __html: ICONS.export }} />
                <div className="bs-panel-option-text">
                  <strong>{t("exportInschrijfstaat")}</strong>
                  <span>{t("exportPanel.asImageDesc")}</span>
                </div>
              </button>
              <button
                className="bs-panel-option"
                onClick={() => void handleXmlExport('cuf', 'CUF-XML')}
              >
                <div className="bs-panel-option-icon" dangerouslySetInnerHTML={{ __html: ICONS.export }} />
                <div className="bs-panel-option-text">
                  <strong>CUF-XML</strong>
                  <span>Ibis, Kraan, ArchiCalc, WpCalc (aanbevolen)</span>
                </div>
              </button>
              <button
                className="bs-panel-option"
                onClick={() => void handleXmlExport('tradxml', 'IBIS-TRAD XML')}
              >
                <div className="bs-panel-option-icon" dangerouslySetInnerHTML={{ __html: ICONS.export }} />
                <div className="bs-panel-option-text">
                  <strong>IBIS-TRAD XML</strong>
                  <span>Experimenteel — alleen basisstructuur</span>
                </div>
              </button>
              <button
                className="bs-panel-option"
                onClick={() => void handleXmlExport('rsx', 'RAW RSX')}
              >
                <div className="bs-panel-option-icon" dangerouslySetInnerHTML={{ __html: ICONS.export }} />
                <div className="bs-panel-option-text">
                  <strong>RAW RSX</strong>
                  <span>CROW GWW — beperkt</span>
                </div>
              </button>
              {isTauriEnvironment() && (
                <button className="bs-panel-option" onClick={handleExportWpCalc}>
                  <div className="bs-panel-option-icon" dangerouslySetInnerHTML={{ __html: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/></svg>' }} />
                  <div className="bs-panel-option-text">
                    <strong>{t("exportPanel.asWpCalc", "WPCalc (.calc)")}</strong>
                    <span>{t("exportPanel.asWpCalcDesc", "Exporteer als WPCalc Access-database voor uitwisseling met WpCalc")}</span>
                  </div>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      <ColumnMappingDialog
        open={!!mappingData}
        data={mappingData}
        onClose={() => setMappingData(null)}
        onConfirm={handleMappingConfirm}
      />
    </div>
  );
}

function AboutPanel() {
  const { t } = useTranslation("backstage");
  return (
    <div className="bs-about-panel">
      <h2 className="bs-about-title">{t("aboutPanel.title")}</h2>
      <div className="bs-about-app">
        <div className="bs-about-logo">
          <svg viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="40" y="40" width="944" height="944" rx="180" fill="#2d8a4e" />
            <text x="512" y="540" textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="750" fontFamily="serif" fontWeight="700" opacity="0.95">Σ</text>
          </svg>
        </div>
        <div className="bs-about-app-info">
          <h1 className="bs-about-app-name">{t("aboutPanel.appName")}</h1>
          <p className="bs-about-version">{t("aboutPanel.version")} {__APP_VERSION__}</p>
        </div>
      </div>
      <p className="bs-about-tagline">{t("aboutPanel.tagline")}</p>
      <p className="bs-about-description">{t("aboutPanel.description")}</p>
      <div className="bs-about-company">
        <h3 className="bs-about-company-name">{t("aboutPanel.companyName")}</h3>
        <p className="bs-about-company-desc">{t("aboutPanel.companyDescription")}</p>
      </div>
      <div className="bs-about-footer">
        <p className="bs-about-copyright">{t("aboutPanel.copyright")}</p>
      </div>
    </div>
  );
}
