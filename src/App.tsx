import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import TitleBar from "./components/layout/TitleBar";
import Ribbon from "./components/ribbon/Ribbon";
import StatusBar from "./components/layout/StatusBar";
import Backstage from "./components/backstage/Backstage";
import SettingsDialog, { applyTheme } from "./components/settings/SettingsDialog";
import FeedbackDialog from "./components/common/FeedbackDialog";
import UnsavedChangesDialog, { registerUnsavedDialogSetter, handleUnsavedResult, showUnsavedChangesDialog } from "./components/common/UnsavedChangesDialog";
import Modal from "./components/common/Modal";
import { FileTabBar } from "./components/layout/FileTabBar";
import { CostGrid } from "./components/grid/CostGrid";
import { ReportPreview } from "./components/report/ReportPreview";
import { SummaryPanel } from "./components/report/SummaryPanel";
import { IfcPreview } from "./components/report/IfcPreview";
import { OfferteView } from "./components/offerte/OfferteView";
import { SchedulePanel } from "./components/panels/SchedulePanel";
import { PropertiesPanel } from "./components/panels/PropertiesPanel";
import { CompanyPanel } from "./components/panels/CompanyPanel";
import { ResourcePicker } from "./components/library/ResourcePicker";
import { SubSheetTabBar } from "./components/grid/SubSheetTabBar";
import WizardModal from "./components/wizard/WizardModal";
import { SubSheetEditor } from "./components/grid/SubSheetEditor";
import { SplitGridPane } from "./components/grid/SplitGridPane";
import { ChatPanel } from "./components/chat/ChatPanel";
import { ThreeDViewer } from "./components/viewers/ThreeDViewer";
import { PdfViewer } from "./components/viewers/PdfViewer";
import { StartSidebar } from "./components/welcome/StartSidebar";
import "./components/welcome/StartSidebar.css";
import { useQuantityLinkSync } from "./hooks/useQuantityLinkSync";
import { useAppStore } from "./state/appStore";
import { deserializeProject } from "./services/file/fileService";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useFileOperations } from "./hooks/useFileOperations";
import { loadAllExtensions } from "./extensions";
import { registerBuiltinExtensions } from "./extensions/builtinExtensions";
import { changeLanguage } from "./i18n/config";
import { loadSettings } from "./utils/settings";
import { initMcpBridge } from "./services/mcp/mcpBridge";
import { sendDockRequest, onWindowBridgeMessage } from "./services/windowBridge";
import "./styles/themes.css";
import "./components/layout/layout.css";
import "./styles/globals.css";

function App() {
  const { t } = useTranslation();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [backstageOpen, setBackstageOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [unsavedDialog, setUnsavedDialog] = useState({ open: false, fileName: "" });
  useEffect(() => { registerUnsavedDialogSetter(setUnsavedDialog); }, []);
  const updateSettings = useAppStore((s) => s.updateSettings);
  useQuantityLinkSync();
  const [theme, setTheme] = useState<string>(localStorage.getItem("ocs-theme") || "light");
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
    loadSettings().then((saved) => {
      const store = useAppStore.getState();
      store.setSettings(saved);
      applyTheme(saved.theme);
      setTheme(saved.theme);
      if (saved.locale && saved.locale !== 'auto') {
        changeLanguage(saved.locale);
      }
    });

    // Register built-in extensions and load user-installed extensions
    registerBuiltinExtensions();
    loadAllExtensions().catch((err) =>
      console.error('[Extensions] Failed to load extensions:', err)
    );

    // Start the MCP bridge (listens for WebSocket mutations via Tauri events)
    let cleanupBridge: (() => void) | undefined;
    initMcpBridge().then((cleanup) => { cleanupBridge = cleanup; });

    // Auto-open file from query parameter (used by "Open in nieuw venster")
    const params = new URLSearchParams(window.location.search);
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
          if (parsed.subSheets) store.setSubSheets(parsed.subSheets);
          if (parsed.offerte) store.setOfferte(parsed.offerte);
          if (parsed.schedule.projectInfo) store.setProjectInfo(parsed.schedule.projectInfo);
        } catch (err) {
          console.error('[App] Failed to auto-open file from query param:', err);
        }
      })();
    } else {
      // No file param: auto-open the bundled voorbeeldbegroting on first launch
      // so users see immediate context. Skipped if user has already opened a doc.
      (async () => {
        try {
          // Wait a tick so settings/extensions are initialised first
          await new Promise(r => setTimeout(r, 50));
          const store = useAppStore.getState();
          if (store.documents.length > 0) return;
          const resp = await fetch('/data/voorbeeld.ifcCalc');
          if (!resp.ok) return;
          const json = await resp.text();
          const parsed = deserializeProject(json);
          const id = crypto.randomUUID();
          store.addDocument({ id, filePath: null, fileName: 'Voorbeeldbegroting', isModified: false, items: parsed.items, schedule: parsed.schedule });
          if (parsed.companyInfo) store.setCompanyInfo(parsed.companyInfo);
          if (parsed.spreadsheets?.sheets) store.setSubSheets(parsed.spreadsheets.sheets);
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
            } else if (ext === 'calc' || ext === 'xtb') {
              const data = await readFile(filePath);
              const importers = store.extensionImporters;
              const imp = importers.find((i: any) => i.fileExtensions.some((fe: string) => fe.replace(/^\./, '') === ext));
              if (imp) {
                const file = new File([data], fileName);
                const result = await imp.handler(file);
                const id = crypto.randomUUID();
                store.addDocument({ id, filePath, fileName: fileName.replace(/\.[^.]+$/, ''), isModified: false, items: result.items, schedule: result.schedule });
                if (result.companyInfo) store.setCompanyInfo(result.companyInfo);
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
              } else if (ext === 'calc' || ext === 'mdb' || ext === 'xls' || ext === 'xlsx' || ext === 'xtb') {
                // Binary import via extension importers
                const data = await readFile(filePath);
                const importers = store.extensionImporters;
                const imp = importers.find((i: any) => i.fileExtensions.some((fe: string) => fe.replace(/^\./, '') === ext));
                if (imp) {
                  const file = new File([data], fileName);
                  const result = await imp.handler(file);
                  const id = crypto.randomUUID();
                  store.addDocument({ id, filePath, fileName: fileName.replace(/\.[^.]+$/, ''), isModified: false, items: result.items, schedule: result.schedule });
                  if (result.companyInfo) store.setCompanyInfo(result.companyInfo);
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

  // Load bundled sample voorbeeldbegroting
  const loadVoorbeeldBudget = useCallback(async () => {
    try {
      const resp = await fetch('/data/voorbeeld.ifcCalc');
      const json = await resp.text();
      const parsed = deserializeProject(json);
      const id = crypto.randomUUID();
      const store = useAppStore.getState();
      store.addDocument({ id, filePath: null, fileName: 'Voorbeeldbegroting', isModified: false, items: parsed.items, schedule: parsed.schedule });
      if (parsed.companyInfo) store.setCompanyInfo(parsed.companyInfo);
      if (parsed.spreadsheets?.sheets) store.setSubSheets(parsed.spreadsheets.sheets);
    } catch (e) {
      console.error('Failed to load voorbeeldbegroting:', e);
    }
  }, []);

  // Intercept window close and show 3-button dialog if unsaved changes
  const { saveFile: saveFileForClose } = useFileOperations();
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

  // Start sidebar state — persistent welcome/start screen on the far left
  const [startSidebarOpen, setStartSidebarOpen] = useState<boolean>(() => {
    const stored = localStorage.getItem("ocs-start-sidebar-open");
    return stored === null ? true : stored === "true";
  });
  useEffect(() => {
    localStorage.setItem("ocs-start-sidebar-open", String(startSidebarOpen));
  }, [startSidebarOpen]);

  // Left panel state
  const [leftPanelWidth, setLeftPanelWidth] = useState(220);
  const [leftPanelOpen, setLeftPanelOpen] = useState(false);
  const isLeftResizing = useRef(false);

  // Right panel state
  const [rightPanelWidth, setRightPanelWidth] = useState(240);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const isRightResizing = useRef(false);

  // Sync panel open state with store
  // Panels are always visible as collapsible tabs. Open state is controlled
  // by leftPanelOpen/rightPanelOpen which the user can toggle via the collapse
  // tabs and close buttons. We only sync once at initial mount.
  useEffect(() => {
    setLeftPanelOpen(showSchedulePanel);
    setRightPanelOpen(showPropertiesPanel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Left panel resize handler
  const handleLeftResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isLeftResizing.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handleMouseMove = (ev: MouseEvent) => {
      if (!isLeftResizing.current) return;
      setLeftPanelWidth(Math.max(160, Math.min(480, ev.clientX)));
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
      setRightPanelWidth(Math.max(160, Math.min(480, window.innerWidth - ev.clientX)));
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

  return (
    <>
      <TitleBar onSettingsClick={() => setSettingsOpen(true)} onFeedbackClick={() => setFeedbackOpen(true)} />
      <Ribbon onFileTabClick={() => setBackstageOpen(true)} />
      <FileTabBar />
      {isDetachedWindow && (
        <div
          className="dock-handle"
          draggable
          onDragStart={handleDockDragStart}
          onClick={handleDockClick}
          title={t('dragToDock') ?? 'Klik om terug te docken in het hoofdvenster'}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M4 2v12M8 6l-4 4 4 4" />
          </svg>
          <span>{t('dockToMain') ?? 'Dock naar hoofdvenster'}</span>
        </div>
      )}
      <div className="content">
        {/* Start sidebar — always visible (collapsible) */}
        {!startSidebarOpen && (
          <button
            className="start-sidebar-collapsed-tab"
            onClick={() => setStartSidebarOpen(true)}
            title="Start"
          >
            <span>Start</span>
          </button>
        )}
        {startSidebarOpen && (
          <StartSidebar
            onLoadVoorbeeld={loadVoorbeeldBudget}
            onClose={() => setStartSidebarOpen(false)}
          />
        )}

        {documents.length === 0 ? (
          <div className="start-empty-main">
            <h3>{t("appName")}</h3>
            <p>Geen begroting open. Maak er een aan via 'Start' links →</p>
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
                title="Inklappen"
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
          {activeContentTab === 'spreadsheet' ? (
            activeSubSheetId && subSheets.some(s => s.id === activeSubSheetId) ? (
              <SubSheetEditor sheetId={activeSubSheetId} />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 12 }}>
                <span style={{ color: 'var(--theme-text-muted)', fontSize: 14 }}>Maak berekeningen in een spreadsheet werkblad</span>
                <button
                  style={{ padding: '8px 20px', background: '#d97706', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
                  onClick={() => {
                    const id = useAppStore.getState().addSubSheet();
                    useAppStore.getState().setActiveContentTab('spreadsheet');
                    useAppStore.getState().setActiveSubSheet(id);
                  }}
                >
                  + Nieuw werkblad
                </button>
              </div>
            )
          ) : activeSubSheetId && activeContentTab === 'grid' && subSheets.some(s => s.id === activeSubSheetId) ? (
            <SubSheetEditor sheetId={activeSubSheetId} />
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
              {activeContentTab === 'rapport' && <ReportPreview />}
              {activeContentTab === 'samenvatting' && <SummaryPanel />}
              {activeContentTab === 'ifc' && <IfcPreview />}
              {activeContentTab === 'offerte' && <OfferteView />}
              {activeContentTab === 'viewer3d' && <ThreeDViewer />}
              {activeContentTab === 'pdf' && <PdfViewer />}
            </>
          )}
          {/* Bottom tab bar: Begroting + Blad N + "+" — shown on grid & spreadsheet views */}
          {(activeContentTab === 'grid' || activeContentTab === 'spreadsheet') && <SubSheetTabBar />}
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
                title="Inklappen"
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
      {!showChatPanel && (
        <button
          className="chat-fab"
          onClick={() => useAppStore.getState().toggleChatPanel()}
          title="Chat assistent"
          style={{ right: rightPanelOpen ? rightPanelWidth + 20 : 20 }}
        >
          💬
        </button>
      )}
      {showChatPanel && (
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
      <WizardModal open={activeDialog === 'wizard'} onClose={closeDialog} />
    </>
  );
}

export default App;
