import { useOwnAssistant } from './hooks/useOwnAssistant';
import { useHostPresentation } from './hooks/useHostPresentation';
import { CalculationWizard } from './components/wizard/CalculationWizard';
import { HostFileDialog } from './components/common/HostFileDialog';
import { getSiteHost, observeSiteHost, hostRecentPath, type SiteHost } from './services/file/siteHost';
import { openHostedFile } from './services/file/hostFileActions';
import { PLATFORM_BUILD } from './services/buildFlags';
import { localStore } from '@/utils/browserStorage';
import { lazy, Suspense, useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import TitleBar from "./components/layout/TitleBar";
import { WorkspaceNavigation } from './components/layout/WorkspaceNavigation';
import { WorkspaceHeader } from './components/layout/WorkspaceHeader';
import { WorkspaceLayoutBar } from './components/layout/WorkspaceLayoutBar';
import { ReviewCenter, ReviewReturnBar } from './components/review/ReviewCenter';
import { QuantityOriginDialog } from './components/common/QuantityOriginCard';
import Ribbon from "./components/ribbon/Ribbon";
import StatusBar from "./components/layout/StatusBar";
import Backstage from "./components/backstage/Backstage";
import SettingsDialog, { applyTheme } from "./components/settings/SettingsDialog";
import FeedbackDialog from "./components/common/FeedbackDialog";
import UnsavedChangesDialog, { registerUnsavedDialogSetter, handleUnsavedResult, showUnsavedChangesDialog } from "./components/common/UnsavedChangesDialog";
import { FileTabBar } from "./components/layout/FileTabBar";
import { CostGrid } from "./components/grid/CostGrid";
import { ReportPreview } from "./components/report/ReportPreview";
import { SummaryPanel } from "./components/report/SummaryPanel";
import { IfcPreview } from "./components/report/IfcPreview";
import { OfferteView } from "./components/offerte/OfferteView";
import { SchedulePanel } from "./components/panels/SchedulePanel";
import { PropertiesPanel } from "./components/panels/PropertiesPanel";
import { ResourcePicker } from "./components/library/ResourcePicker";
import { SpreadsheetReturnBar, SubSheetTabBar } from "./components/grid/SubSheetTabBar";
import WizardModal from "./components/wizard/WizardModal";
import { SubSheetEditor } from "./components/grid/SubSheetEditor";
import { SplitGridPane } from "./components/grid/SplitGridPane";
import { ChatPanel } from "./components/chat/ChatPanel";
import { PromptBudgetWorkspace } from "./components/chat/PromptBudgetWorkspace";
import { MobileWorkspace } from "./components/mobile/MobileWorkspace";
import { restoreMobileDraft, saveMobileDraft } from "./components/mobile/mobileDraft";
const ThreeDViewer = lazy(() => import("./components/viewers/ThreeDViewer").then(m => ({ default: m.ThreeDViewer })));
const PdfViewer = lazy(() => import("./components/viewers/PdfViewer").then(m => ({ default: m.PdfViewer })));
import { StartSidebar } from "./components/welcome/StartSidebar";
import "./components/welcome/StartSidebar.css";
import { UrenStaartView } from "./components/grid/WpCalcBottomPanel";
import { useQuantityLinkSync } from "./hooks/useQuantityLinkSync";
import { useAppStore } from "./state/appStore";
import { deserializeProject } from "./services/file/fileService";
import { createDefaultSchedule } from "./data/defaultBudget";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useFileOperations } from "./hooks/useFileOperations";
import { showImportWarnings } from "./components/common/ImportWarningsDialog";
import { loadAllExtensions } from "./extensions";
import { registerBuiltinExtensions } from "./extensions/builtinExtensions";
import i18next, { changeLanguage } from "./i18n/config";
import { loadSettings } from "./utils/settings";
import { initMcpBridge } from "./services/mcp/mcpBridge";
import { initOsUsername } from "./services/system/osUser";
import { loadSampleBudgetText } from "./services/file/sampleBudget";
import { isEmbedded, getEmbedOptions } from "./lib/hostRoot";
import { sendDockRequest, onWindowBridgeMessage } from "./services/windowBridge";
import "./styles/themes.css";
import "./components/layout/layout.css";
import "./styles/globals.css";
import "./styles/blueprint/openaec-tokens.css";
import "./styles/blueprint/openaec-fonts.css";
import "./styles/blueprint/openaec-components.css";
import "./styles/blueprintBridge.css";
import "./components/layout/WorkspaceShell.css";

/**
 * Open de meegeleverde voorbeeldbegroting in de taal van de interface:
 * de Nederlandse voor nl, anders de Engelse. Beide hebben dezelfde getallen
 * en structuur; alleen omschrijvingen en projectgegevens verschillen.
 */
async function openSampleBudget(): Promise<void> {
  const parsed = deserializeProject(await loadSampleBudgetText(i18next.language || 'en'));
  const store = useAppStore.getState();
  store.addDocument({ id: crypto.randomUUID(), filePath: null, fileName: i18next.t('app.sampleBudget'), isModified: false, items: parsed.items, schedule: parsed.schedule });
  if (parsed.companyInfo) store.setCompanyInfo(parsed.companyInfo);
  if (parsed.spreadsheets?.sheets) store.setSubSheets(parsed.spreadsheets.sheets);
}

const MOBILE_QUERY = '(max-width: 760px), (pointer: coarse) and (max-width: 1024px)';

function App() {
  const { t } = useTranslation();
  const ownAssistant = useOwnAssistant();
  const [hostError, setHostError] = useState('');
  const [settingsReady, setSettingsReady] = useState(false);
  const openedHosts = useRef(new WeakSet<SiteHost>());
  useEffect(() => {
    if (!settingsReady) return;
    return observeSiteHost(host => {
    if (!host || openedHosts.current.has(host)) return;
    openedHosts.current.add(host);
    Promise.resolve().then(() => host.list()).then(files => {
      const state = useAppStore.getState();
      const paths = [...files].sort((a, b) => b.modified.localeCompare(a.modified)).slice(0, 10).map(file => {
        localStore.setItem('ocs-host-name:' + file.id, file.name);
        return hostRecentPath(file.id);
      });
      state.updateSettings({ recentFiles: [...new Set([...paths, ...(state.settings.recentFiles ?? [])])].slice(0, 10) });
    }).catch(error => setHostError(String(error)));
    if (host.initialFileId) void openHostedFile(host.initialFileId).catch(error => setHostError(String(error)));
    });
  }, [settingsReady]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [backstageOpen, setBackstageOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [unsavedDialog, setUnsavedDialog] = useState({ open: false, fileName: "" });
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches);
  useEffect(() => {
    const media = window.matchMedia(MOBILE_QUERY);
    const onChange = () => setIsMobile(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
  useEffect(() => { registerUnsavedDialogSetter(setUnsavedDialog); }, []);
  const updateSettings = useAppStore((s) => s.updateSettings);
  useQuantityLinkSync();
  const [theme, setTheme] = useState<string>(localStore.getItem("ocs-theme") || "light");
  const hostedPresentation = useHostPresentation(settingsReady, setTheme);
  const { showSchedulePanel, showPropertiesPanel, showChatPanel, activeContentTab, activeDialog, closeDialog, documents, splitView, splitDocumentId, setSplitDocumentId } = useAppStore();
  const activeSubSheetId = useAppStore((s) => s.activeSubSheetId);
  const subSheets = useAppStore((s) => s.subSheets);

  // Detect if this is a detached window (opened via "Open in nieuw venster")
  const detachedFileRef = useRef<string | null>(null);
  const windowLabelRef = useRef<string>('');
  const [isDetachedWindow, setIsDetachedWindow] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fileParam = params.get('file');
    const tParam = params.get('_t');
    if (fileParam) {
      detachedFileRef.current = decodeURIComponent(fileParam);
      windowLabelRef.current = tParam ? `window-${tParam}` : `window-${Date.now()}`;
      setIsDetachedWindow(true);
    }
  }, []);

  // Listen for close-detached messages from the main window
  useEffect(() => {
    if (!isDetachedWindow) return;
    const cleanup = onWindowBridgeMessage(async (msg) => {
      if (msg.type === 'close-detached' && msg.windowLabel === windowLabelRef.current) {
        try {
          const { getCurrentWindow } = await import('@tauri-apps/api/window');
          getCurrentWindow().destroy();
        } catch {
          window.close();
        }
      }
    });
    return cleanup;
  }, [isDetachedWindow]);

  // Dock handle drag start for detached windows (for same-window drag)
  const handleDockDragStart = useCallback((e: React.DragEvent) => {
    if (!detachedFileRef.current) return;
    const data = JSON.stringify({
      filePath: detachedFileRef.current,
      windowLabel: windowLabelRef.current,
    });
    e.dataTransfer.setData('text/ocs-dock', data);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  // Click-to-dock: sends dock request via BroadcastChannel to main window
  const handleDockClick = useCallback(() => {
    if (!detachedFileRef.current) return;
    sendDockRequest(detachedFileRef.current, windowLabelRef.current);
  }, []);

  useKeyboardShortcuts();

  // Load test-begroting on startup
  const defaultLoaded = useRef(false);
  useEffect(() => {
    if (defaultLoaded.current) return;
    defaultLoaded.current = true;
    // Load persisted settings from Tauri store
    loadSettings().then((loaded) => {
      // Ingebouwd in een andere site winnen het thema en de taal van de
      // gastpagina van de opgeslagen voorkeur.
      const embed = isEmbedded() ? getEmbedOptions() : {};
      const saved = {
        ...loaded,
        ...(embed.theme ? { theme: embed.theme as typeof loaded.theme } : {}),
        ...(embed.locale ? { locale: embed.locale as typeof loaded.locale } : {}),
      };
      const store = useAppStore.getState();
      store.setSettings(saved);
      if (!isEmbedded() && saved.lastWorkspaceLayoutId) {
        try { store.applyWorkspaceLayout(saved.lastWorkspaceLayoutId); } catch { /* Removed or invalid saved layout: keep the default editor. */ }
      }
      applyTheme(saved.theme);
      setTheme(saved.theme);
      if (saved.locale && saved.locale !== 'auto') {
        changeLanguage(saved.locale);
      }
    }).catch(error => setHostError(String(error))).finally(() => setSettingsReady(true));

    // Resolve the Windows username once, so edit-history entries are attributed
    // to the right person (cached synchronously for the store's updateItem).
    initOsUsername();

    // Register built-in extensions and load user-installed extensions
    registerBuiltinExtensions();
    loadAllExtensions().catch((err) =>
      console.error('[Extensions] Failed to load extensions:', err)
    );

    // Start the MCP bridge (listens for WebSocket mutations via Tauri events)
    let cleanupBridge: (() => void) | undefined;
    initMcpBridge().then((cleanup) => { cleanupBridge = cleanup; });

    // Auto-open file from query parameter (used by "Open in nieuw venster")
    // Ingebouwd in een andere site is de query-string van de gastpagina;
    // een ?file= daar is niet voor ons.
    const params = new URLSearchParams(isEmbedded() ? '' : window.location.search);
    const fileParam = params.get('file');
    if (fileParam) {
      const filePath = decodeURIComponent(fileParam);
      (async () => {
        try {
          const { readTextFile } = await import('@tauri-apps/plugin-fs');
          const content = await readTextFile(filePath);
          const parsed = deserializeProject(content);
          const fileName = filePath.replace(/\\/g, '/').split('/').pop()?.replace(/\.(ifcx|json|ocs)$/i, '') ?? 'Begroting';
          const id = crypto.randomUUID();
          const store = useAppStore.getState();
          store.addDocument({ id, filePath, fileName, isModified: false, items: parsed.items, schedule: parsed.schedule });
          if (parsed.companyInfo) store.setCompanyInfo(parsed.companyInfo);
          store.setSubSheets(parsed.spreadsheets?.sheets ?? parsed.subSheets ?? []);
          if (parsed.offerte) store.setOfferte(parsed.offerte);
          if (parsed.schedule.projectInfo) store.setProjectInfo(parsed.schedule.projectInfo);
        } catch (err) {
          console.error('[App] Failed to auto-open file from query param:', err);
        }
      })();
    } else {
      const restoredDraft = isMobile && !('__TAURI_INTERNALS__' in window) && restoreMobileDraft();
      // No file param: auto-open the bundled voorbeeldbegroting on first launch
      // so users see immediate context. Skipped if user has already opened a doc.
      (async () => {
        try {
          // Wait a tick so settings/extensions are initialised first
          await new Promise(r => setTimeout(r, 50));
          if (PLATFORM_BUILD || getSiteHost() || restoredDraft || useAppStore.getState().documents.length > 0) return;
          // Ingebouwd bepaalt de gastpagina of het voorbeeld opengaat.
          if (isEmbedded() && !getEmbedOptions().autoSample) return;
          await openSampleBudget();
        } catch (err) {
          console.warn('[App] Could not auto-load voorbeeldbegroting:', err);
        }
      })();
    }

    // ── File association: Tauri Rust emits this when launched with a file argument ──
    let unlistenAssoc: (() => void) | undefined;
    (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        const { readTextFile, readFile } = await import("@tauri-apps/plugin-fs");
        unlistenAssoc = await listen<string>('file-association-open', async (e) => {
          const filePath = e.payload;
          const fileName = filePath.replace(/\\/g, '/').split('/').pop() ?? 'Begroting';
          const ext = fileName.split('.').pop()?.toLowerCase();
          const store = useAppStore.getState();
          try {
            if (ext === 'ifcCalc' || ext === 'ifccalc' || ext === 'json' || ext === 'ocs' || ext === 'ifcx') {
              const content = await readTextFile(filePath);
              const parsed = deserializeProject(content);
              const id = crypto.randomUUID();
              const displayName = fileName.replace(/\.[^.]+$/, '');
              store.addDocument({ id, filePath, fileName: displayName, isModified: false, items: parsed.items, schedule: parsed.schedule });
              if (parsed.companyInfo) store.setCompanyInfo(parsed.companyInfo);
              if (parsed.spreadsheets?.sheets) store.setSubSheets(parsed.spreadsheets.sheets);
            } else if (['x81', 'x82', 'x83', 'x84', 'x86', 'x87'].includes(ext ?? '')) {
              const { importGaeb } = await import('./services/importers/gaebImporter');
              const result = importGaeb(await readTextFile(filePath));
              store.addDocument({ id: crypto.randomUUID(), filePath: null, fileName: fileName.replace(/\.[^.]+$/, ''), isModified: true, items: result.items, schedule: { ...createDefaultSchedule(), ...result.schedule } });
              showImportWarnings(result, fileName);
            } else if (ext === 'calc' || ext === 'xtb' || ext === 'dnc' || ext === 'bc3' || ext === 'onlv' || ext === 'onlb') {
              const data = await readFile(filePath);
              const importers = store.extensionImporters;
              const imp = importers.find((i: any) => i.fileExtensions.some((fe: string) => fe.replace(/^\./, '') === ext));
              if (imp) {
                const file = new File([data], fileName);
                const result = await imp.handler(file);
                const id = crypto.randomUUID();
                store.addDocument({ id, filePath, fileName: fileName.replace(/\.[^.]+$/, ''), isModified: false, items: result.items, schedule: result.schedule });
                if (result.companyInfo) store.setCompanyInfo(result.companyInfo);
                showImportWarnings(result, fileName);
              }
            }
          } catch (err) {
            console.error('[FileAssoc] Failed to open:', filePath, err);
          }
        });
      } catch (e) {
        console.warn('[FileAssoc] Tauri events unavailable:', e);
      }
    })();

    // ── Drag-and-drop file open ──
    // Tauri WebView v2 fires file-drop events through the window object.
    // Frontend HTML5 dragover/drop also catches drops from external file managers.
    let unlistenDrop: (() => void) | undefined;
    (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const win = getCurrentWindow();
        unlistenDrop = await win.onDragDropEvent(async (event) => {
          if (event.payload.type !== 'drop') return;
          const paths = (event.payload as any).paths as string[] | undefined;
          if (!paths || paths.length === 0) return;
          const { readTextFile, readFile } = await import("@tauri-apps/plugin-fs");
          const store = useAppStore.getState();
          for (const filePath of paths) {
            const fileName = filePath.replace(/\\/g, '/').split('/').pop() ?? 'Begroting';
            const ext = fileName.split('.').pop()?.toLowerCase();
            try {
              if (ext === 'ifcCalc' || ext === 'ifccalc' || ext === 'json' || ext === 'ocs' || ext === 'ifcx') {
                const content = await readTextFile(filePath);
                const parsed = deserializeProject(content);
                const id = crypto.randomUUID();
                const displayName = fileName.replace(/\.[^.]+$/, '');
                store.addDocument({ id, filePath, fileName: displayName, isModified: false, items: parsed.items, schedule: parsed.schedule });
                if (parsed.companyInfo) store.setCompanyInfo(parsed.companyInfo);
                if (parsed.spreadsheets?.sheets) store.setSubSheets(parsed.spreadsheets.sheets);
              } else if (['x81', 'x82', 'x83', 'x84', 'x86', 'x87'].includes(ext ?? '')) {
                const { importGaeb } = await import('./services/importers/gaebImporter');
                const result = importGaeb(await readTextFile(filePath));
                store.addDocument({ id: crypto.randomUUID(), filePath: null, fileName: fileName.replace(/\.[^.]+$/, ''), isModified: true, items: result.items, schedule: { ...createDefaultSchedule(), ...result.schedule } });
                showImportWarnings(result, fileName);
              } else if (ext === 'calc' || ext === 'mdb' || ext === 'xls' || ext === 'xlsx' || ext === 'xtb' || ext === 'dnc' || ext === 'bc3' || ext === 'onlv' || ext === 'onlb') {
                // Import via extension importers (binair én tekst — de handler leest de bytes zelf)
                const data = await readFile(filePath);
                const importers = store.extensionImporters;
                const imp = importers.find((i: any) => i.fileExtensions.some((fe: string) => fe.replace(/^\./, '') === ext));
                if (imp) {
                  const file = new File([data], fileName);
                  const result = await imp.handler(file);
                  const id = crypto.randomUUID();
                  store.addDocument({ id, filePath, fileName: fileName.replace(/\.[^.]+$/, ''), isModified: false, items: result.items, schedule: result.schedule });
                  if (result.companyInfo) store.setCompanyInfo(result.companyInfo);
                  showImportWarnings(result, fileName);
                }
              }
            } catch (e) {
              console.error('[Drop] Failed to open:', filePath, e);
            }
          }
        });
      } catch (e) {
        // Not in Tauri context
        console.warn('[Drop] Tauri drop events unavailable:', e);
      }
    })();

    return () => {
      cleanupBridge?.();
      unlistenDrop?.();
      unlistenAssoc?.();
    };
  }, []);

  useEffect(() => {
    if (!isMobile || '__TAURI_INTERNALS__' in window) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(saveMobileDraft, 700);
    };
    const unsubscribe = useAppStore.subscribe((state, previous) => {
      if (state.items !== previous.items || state.schedule !== previous.schedule || state.subSheets !== previous.subSheets || state.companyInfo !== previous.companyInfo || state.offerte !== previous.offerte || state.projectInfo !== previous.projectInfo || state.activeDocumentId !== previous.activeDocumentId || state.documents !== previous.documents) schedule();
    });
    window.addEventListener('pagehide', saveMobileDraft);
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
      window.removeEventListener('pagehide', saveMobileDraft);
    };
  }, [isMobile]);

  // Load bundled sample voorbeeldbegroting
  const loadVoorbeeldBudget = useCallback(async () => {
    try {
      await openSampleBudget();
    } catch (e) {
      console.error('Failed to load voorbeeldbegroting:', e);
    }
  }, []);

  // Intercept window close and show 3-button dialog if unsaved changes
  const { saveFile: saveFileForClose } = useFileOperations();

  // Autosave: sla het actieve document elke 2 minuten stil op als het is
  // gewijzigd én al een bestandspad heeft. Nooit een Opslaan-als-dialoog
  // (documenten zonder pad worden overgeslagen); alleen in de desktop-app.
  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return;
    const id = setInterval(() => {
      const s = useAppStore.getState();
      const doc = s.documents.find((d) => d.id === s.activeDocumentId);
      if (doc?.isModified && doc.filePath) {
        void saveFileForClose();
      }
    }, 120_000);
    return () => clearInterval(id);
  }, [saveFileForClose]);
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const win = getCurrentWindow();
        unlisten = await win.onCloseRequested(async (event) => {
          const docs = useAppStore.getState().documents;
          const unsavedDoc = docs.find((d) => d.isModified);
          if (unsavedDoc) {
            event.preventDefault();
            const result = await showUnsavedChangesDialog(unsavedDoc.fileName);
            if (result === 'cancel') return;
            if (result === 'save') {
              await saveFileForClose();
              // Check if still modified (user may have cancelled save-as)
              const refreshed = useAppStore.getState().documents.find((d) => d.id === unsavedDoc.id);
              if (refreshed?.isModified) return;
            }
            // 'discard' or successful save — close the window
            win.destroy();
          }
        });
      } catch {
        // Not in Tauri environment
      }
    })();
    return () => { unlisten?.(); };
  }, [t]);

  const [startSidebarOpen, setStartSidebarOpen] = useState(false);
  const projectDrawerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!startSidebarOpen) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    projectDrawerRef.current?.querySelector<HTMLButtonElement>('.start-sidebar-close-btn')?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setStartSidebarOpen(false); }
      if (event.key !== 'Tab') return;
      const buttons = projectDrawerRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
      if (!buttons?.length) return;
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handleKey, true);
    return () => { document.removeEventListener('keydown', handleKey, true); previousFocus?.focus(); };
  }, [startSidebarOpen]);

  const leftPanelWidth = useAppStore(s => s.leftPanelWidth);
  const setLeftPanelWidth = useAppStore(s => s.setLeftPanelWidth);
  const leftPanelOpen = showSchedulePanel;
  const setLeftPanelOpen = (open: boolean) => useAppStore.setState({ showSchedulePanel: open });
  const isLeftResizing = useRef(false);
  const rightPanelWidth = useAppStore(s => s.rightPanelWidth);
  const setRightPanelWidth = useAppStore(s => s.setRightPanelWidth);
  const rightPanelOpen = showPropertiesPanel;
  const setRightPanelOpen = (open: boolean) => useAppStore.setState({ showPropertiesPanel: open });
  const isRightResizing = useRef(false);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Left panel resize handler
  const handleLeftResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const panelLeft = e.currentTarget.parentElement?.getBoundingClientRect().left ?? 0;
    isLeftResizing.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handleMouseMove = (ev: MouseEvent) => {
      if (!isLeftResizing.current) return;
      setLeftPanelWidth(Math.max(160, Math.min(480, ev.clientX - panelLeft)));
    };

    const handleMouseUp = () => {
      isLeftResizing.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, []);

  // Right panel resize handler
  const handleRightResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isRightResizing.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handleMouseMove = (ev: MouseEvent) => {
      if (!isRightResizing.current) return;
      setRightPanelWidth(Math.max(200, Math.min(540, window.innerWidth - ev.clientX)));
    };

    const handleMouseUp = () => {
      isRightResizing.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, []);

  if (isMobile && !isDetachedWindow) {
    return (
      <>
        <HostFileDialog />
        {hostError && <div className="oa-banner" role="alert">{hostError}</div>}
        <MobileWorkspace />
        <UnsavedChangesDialog open={unsavedDialog.open} fileName={unsavedDialog.fileName} onResult={handleUnsavedResult} />
      </>
    );
  }

  return (
    <div className="oa-app calc-studio-shell">
      <HostFileDialog />
      {hostError && <div className="oa-banner" role="alert">{hostError}</div>}
      {!hostedPresentation && <TitleBar onSettingsClick={() => setSettingsOpen(true)} onFeedbackClick={() => setFeedbackOpen(true)} />}
      <Ribbon onFileTabClick={() => setBackstageOpen(true)} />
      <FileTabBar />
      {isDetachedWindow && (
        <div
          className="dock-handle"
          draggable
          onDragStart={handleDockDragStart}
          onClick={handleDockClick}
          title={t('dragToDock')}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M4 2v12M8 6l-4 4 4 4" />
          </svg>
          <span>{t('dockToMain')}</span>
        </div>
      )}
      <div className="content">
        <WorkspaceNavigation onStart={() => setStartSidebarOpen(value => !value)} onSettings={() => setSettingsOpen(true)} />
        {startSidebarOpen && (
          <div className="workspace-project-drawer" ref={projectDrawerRef} role="dialog" aria-modal="true" aria-label={t('start')}>
            <button className="workspace-drawer-scrim" aria-label={t('close')} onClick={() => setStartSidebarOpen(false)} />
            <StartSidebar onLoadVoorbeeld={() => { loadVoorbeeldBudget(); setStartSidebarOpen(false); }} onClose={() => setStartSidebarOpen(false)} />
          </div>
        )}

        {documents.length === 0 ? (
          <div className="start-empty-main">
            <h3>{t("appName")}</h3>
            <p>{t('app.noBudgetOpen')}</p>
            <button className="oa-button oa-button--primary" onClick={() => setStartSidebarOpen(true)}>{t('open')}</button>
          </div>
        ) : (
        <>
        {/* Left panel — Schedule Structure (always collapsible tab visible) */}
        {!leftPanelOpen && (
          <button
            className="left-panel-collapsed-tab"
            onClick={() => setLeftPanelOpen(true)}
            title={t("explorer")}
          >
            <span>{t("explorer")}</span>
          </button>
        )}
        {leftPanelOpen && (
          <aside className="left-panel" style={{ width: leftPanelWidth }}>
            <div className="left-panel-toolbar">
              <span className="left-panel-title">{t("explorer")}</span>
              <button
                className="left-panel-close-btn"
                onClick={() => setLeftPanelOpen(false)}
                title={t('collapse')}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M10.78 4.22a.75.75 0 010 1.06L8.06 8l2.72 2.72a.75.75 0 11-1.06 1.06L6.94 8.53a.75.75 0 010-1.06l2.78-2.78a.75.75 0 011.06 0z"/>
                  <path d="M6.78 4.22a.75.75 0 010 1.06L4.06 8l2.72 2.72a.75.75 0 11-1.06 1.06L2.94 8.53a.75.75 0 010-1.06l2.78-2.78a.75.75 0 011.06 0z"/>
                </svg>
              </button>
            </div>
            <div className="left-panel-body">
              <SchedulePanel />
            </div>
            <div className="left-panel-resize" onMouseDown={handleLeftResizeMouseDown} />
          </aside>
        )}

        <main className="main-view">
          <WorkspaceHeader />
          <WorkspaceLayoutBar />
          <div className="workspace-body">
          {activeContentTab === 'grid' && <ReviewReturnBar />}
          {activeContentTab === 'spreadsheet' && <SpreadsheetReturnBar />}
          {activeContentTab === 'spreadsheet' ? (
            activeSubSheetId && subSheets.some(s => s.id === activeSubSheetId) ? (
              <SubSheetEditor sheetId={activeSubSheetId} />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 12 }}>
                <span style={{ color: 'var(--theme-text-muted)', fontSize: 14 }}>{t('app.spreadsheetEmpty')}</span>
                <button
                  style={{ padding: '8px 20px', background: '#d97706', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
                  onClick={() => {
                    const id = useAppStore.getState().addSubSheet();
                    useAppStore.getState().setActiveContentTab('spreadsheet');
                    useAppStore.getState().setActiveSubSheet(id);
                  }}
                >
                  {t('app.newSheet')}
                </button>
              </div>
            )
          ) : activeContentTab === 'grid' && splitView && splitDocumentId ? (
            <div className="split-view-container">
              <div className="split-view-left">
                <CostGrid />
              </div>
              <div className="split-divider" />
              <div className="split-view-right">
                <SplitGridPane documentId={splitDocumentId} onClose={() => setSplitDocumentId(null)} />
              </div>
            </div>
          ) : (
            <>
              {activeContentTab === 'grid' && <CostGrid />}
              {activeContentTab === 'review' && <ReviewCenter />}
              {activeContentTab === 'promptBudget' && <PromptBudgetWorkspace />}
              {activeContentTab === 'wizard' && <CalculationWizard />}
              {activeContentTab === 'urenstaart' && <UrenStaartView />}
              {activeContentTab === 'rapport' && <ReportPreview />}
              {activeContentTab === 'samenvatting' && <SummaryPanel />}
              {activeContentTab === 'ifc' && <IfcPreview />}
              {activeContentTab === 'offerte' && <OfferteView />}
              {activeContentTab === 'viewer3d' && <Suspense fallback={<div role="status">…</div>}><ThreeDViewer /></Suspense>}
              {activeContentTab === 'pdf' && <Suspense fallback={<div role="status">…</div>}><PdfViewer /></Suspense>}
            </>
          )}
          {/* Bottom tab bar: Begroting + Blad N + "+" — shown on grid & spreadsheet views */}
          <SubSheetTabBar sheetsOnly />
          </div>
        </main>

        {/* Right panel — Properties */}
        {!rightPanelOpen && (
          <button
            className="right-panel-collapsed-tab"
            onClick={() => setRightPanelOpen(true)}
            title={t("properties")}
          >
            <span>{t("properties")}</span>
          </button>
        )}
        {rightPanelOpen && (
          <aside className="right-panel" style={{ width: rightPanelWidth }}>
            <div className="right-panel-resize" onMouseDown={handleRightResizeMouseDown} />
            <div className="right-panel-toolbar">
              <span className="right-panel-title">{t("properties")}</span>
              <button
                className="right-panel-close-btn"
                onClick={() => setRightPanelOpen(false)}
                title={t('collapse')}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M5.22 4.22a.75.75 0 011.06 0l2.78 2.78a.75.75 0 010 1.06l-2.78 2.78a.75.75 0 11-1.06-1.06L7.94 8 5.22 5.28a.75.75 0 010-1.06z"/>
                  <path d="M9.22 4.22a.75.75 0 011.06 0l2.78 2.78a.75.75 0 010 1.06l-2.78 2.78a.75.75 0 11-1.06-1.06L11.94 8 9.22 5.28a.75.75 0 010-1.06z"/>
                </svg>
              </button>
            </div>
            <div className="right-panel-body">
              <PropertiesPanel />
            </div>
          </aside>
        )}
        </>
        )}
      </div>
      {/* Floating chat button + panel — bottom right */}
      {ownAssistant && !showChatPanel && activeContentTab !== 'promptBudget' && (
        <button
          className="chat-fab"
          onClick={() => useAppStore.getState().toggleChatPanel()}
          title={t('app.chatAssistant')}
          style={{ right: rightPanelOpen ? rightPanelWidth + 20 : 20 }}
        >
          💬
        </button>
      )}
      {ownAssistant && showChatPanel && activeContentTab !== 'promptBudget' && (
        <div className="chat-floating">
          <ChatPanel />
        </div>
      )}
      <StatusBar />
      <Backstage
        open={backstageOpen}
        onClose={() => setBackstageOpen(false)}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        theme={theme}
        onThemeChange={(t: string) => { setTheme(t as typeof theme); updateSettings({ theme: t as any }); }}
      />
      <FeedbackDialog open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
      <UnsavedChangesDialog open={unsavedDialog.open} fileName={unsavedDialog.fileName} onResult={handleUnsavedResult} />
      <ResourcePicker />
      <QuantityOriginDialog />
      <WizardModal open={activeDialog === 'wizard'} onClose={closeDialog} />
    </div>
  );
}

export default App;
