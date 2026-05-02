import React, { useCallback, useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/state/appStore';
import type { DocumentTab } from '@/types/costModel';
import { useFileOperations } from '@/hooks/useFileOperations';
import { showUnsavedChangesDialog } from '@/components/common/UnsavedChangesDialog';
import { isTauriEnvironment } from '@/services/file/nativeFileService';
import { onWindowBridgeMessage, sendCloseDetached } from '@/services/windowBridge';

interface TabContextMenu {
  x: number;
  y: number;
  docId: string;
}

export const FileTabBar: React.FC = () => {
  const { t } = useTranslation();
  const { documents, activeDocumentId, setActiveDocument, removeDocument } = useAppStore();
  const { newFile, saveFile, openRecentFile } = useFileOperations();
  const [contextMenu, setContextMenu] = useState<TabContextMenu | null>(null);
  const [dockDropActive, setDockDropActive] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const tabBarRef = useRef<HTMLDivElement>(null);
  const dragDocRef = useRef<DocumentTab | null>(null);

  const confirmAndClose = useCallback(async (id: string) => {
    const doc = useAppStore.getState().documents.find((d) => d.id === id);
    if (doc?.isModified) {
      const result = await showUnsavedChangesDialog(doc.fileName);
      if (result === 'cancel') return;
      if (result === 'save') {
        if (useAppStore.getState().activeDocumentId === id) {
          await saveFile();
        }
        // If still modified after save (e.g. user cancelled save-as), don't close
        const refreshed = useAppStore.getState().documents.find((d) => d.id === id);
        if (refreshed?.isModified) return;
      }
      // 'discard' falls through
    }
    removeDocument(id);
  }, [removeDocument, saveFile]);

  const handleClose = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    e.preventDefault();
    void confirmAndClose(id);
  }, [confirmAndClose]);

  const handleCloseMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  const handleMiddleClick = useCallback((e: React.MouseEvent, id: string) => {
    if (e.button === 1) {
      e.preventDefault();
      e.stopPropagation();
      void confirmAndClose(id);
    }
  }, [confirmAndClose]);

  const handleContextMenu = useCallback((e: React.MouseEvent, docId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, docId });
  }, []);

  // Close context menu on click outside or Escape
  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenu]);

  // Adjust context menu position to stay within viewport
  useEffect(() => {
    if (!contextMenu || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      menuRef.current.style.left = `${contextMenu.x - rect.width}px`;
    }
    if (rect.bottom > window.innerHeight) {
      menuRef.current.style.top = `${contextMenu.y - rect.height}px`;
    }
  }, [contextMenu]);

  const handleOpenInNewWindow = useCallback(async () => {
    if (!contextMenu) return;
    const doc = documents.find((d) => d.id === contextMenu.docId);
    setContextMenu(null);
    if (!doc) return;

    let filePath = doc.filePath;

    // If no filePath, save to temp location first
    if (!filePath) {
      try {
        const { appDataDir } = await import('@tauri-apps/api/path');
        const { writeTextFile, mkdir } = await import('@tauri-apps/plugin-fs');
        const tempDir = await appDataDir();
        const dir = `${tempDir}temp`;
        try { await mkdir(dir, { recursive: true }); } catch { /* exists */ }
        filePath = `${dir}/${doc.fileName || 'begroting'}.ifcx`;
        const store = useAppStore.getState();
        const { serializeProject } = await import('@/services/file/fileService');
        const scheduleWithProjectInfo = { ...store.schedule, projectInfo: store.projectInfo };
        const json = serializeProject(scheduleWithProjectInfo, store.items, store.companyInfo, store.subSheets, store.offerte);
        await writeTextFile(filePath, json);
      } catch (err) {
        console.error('[FileTabBar] Failed to save temp file:', err);
        return;
      }
    }

    try {
      const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
      const label = `window-${Date.now()}`;
      const encodedPath = encodeURIComponent(filePath);
      new WebviewWindow(label, {
        url: `/?file=${encodedPath}`,
        title: `Open Calc Studio - ${doc.fileName}`,
        width: 1400,
        height: 900,
        decorations: false,
      });
    } catch (err) {
      console.error('[FileTabBar] Failed to open new window:', err);
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('open_new_window', { filePath });
      } catch (err2) {
        console.error('[FileTabBar] Rust fallback also failed:', err2);
      }
    }
  }, [contextMenu, documents]);

  const handleCloseTab = useCallback(() => {
    if (!contextMenu) return;
    const docId = contextMenu.docId;
    setContextMenu(null);
    void confirmAndClose(docId);
  }, [contextMenu, confirmAndClose]);

  const handleDragStart = useCallback((e: React.DragEvent, doc: DocumentTab) => {
    e.dataTransfer.setData('text/plain', doc.id);
    e.dataTransfer.effectAllowed = 'move';
    dragDocRef.current = doc;
  }, []);

  const handleDragEnd = useCallback(async (e: React.DragEvent) => {
    const doc = dragDocRef.current;
    dragDocRef.current = null;
    if (!doc?.filePath) return;

    // Check if dropped outside tab bar
    const tabBar = tabBarRef.current;
    if (!tabBar) return;
    const rect = tabBar.getBoundingClientRect();
    const outsideY = e.clientY < rect.top - 50 || e.clientY > rect.bottom + 50;
    const outsideX = e.clientX < rect.left - 100 || e.clientX > rect.right + 100;

    if (outsideY || outsideX) {
      // Detach into new window
      try {
        const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
        const label = `window-${Date.now()}`;
        const encodedPath = encodeURIComponent(doc.filePath);
        new WebviewWindow(label, {
          url: `/?file=${encodedPath}`,
          title: `Open Calc Studio - ${doc.fileName}`,
          width: 1400,
          height: 900,
          decorations: false,
        });
        removeDocument(doc.id);
      } catch (err) {
        console.error('[FileTabBar] Failed to detach tab:', err);
      }
    }
  }, [removeDocument]);

  // ─── Dock a detached window back as a tab ───
  const dockFile = useCallback(async (filePath: string, windowLabel: string) => {
    // Check if file is already open as a tab
    const existing = useAppStore.getState().documents.find((d) => d.filePath === filePath);
    if (existing) {
      setActiveDocument(existing.id);
    } else {
      await openRecentFile(filePath);
    }
    // Tell the detached window to close itself
    sendCloseDetached(windowLabel);
  }, [openRecentFile, setActiveDocument]);

  // Listen for dock-request messages from detached windows via BroadcastChannel
  useEffect(() => {
    // Only the main window should listen (no ?file= param)
    const params = new URLSearchParams(window.location.search);
    if (params.get('file')) return;
    const cleanup = onWindowBridgeMessage((msg) => {
      if (msg.type === 'dock-request') {
        void dockFile(msg.filePath, msg.windowLabel);
      }
    });
    return cleanup;
  }, [dockFile]);

  // Drop handlers for docking detached windows via drag
  const handleDockDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('text/ocs-dock')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDockDropActive(true);
    }
  }, []);

  const handleDockDragLeave = useCallback(() => {
    setDockDropActive(false);
  }, []);

  const handleDockDrop = useCallback((e: React.DragEvent) => {
    setDockDropActive(false);
    const data = e.dataTransfer.getData('text/ocs-dock');
    if (!data) return;
    e.preventDefault();
    try {
      const { filePath, windowLabel } = JSON.parse(data) as { filePath: string; windowLabel: string };
      void dockFile(filePath, windowLabel);
    } catch {
      // Invalid data
    }
  }, [dockFile]);

  const setSplitDocumentId = useAppStore((s) => s.setSplitDocumentId);
  const activeDocumentId2 = useAppStore((s) => s.activeDocumentId);

  const handleViewBeside = useCallback(() => {
    if (!contextMenu) return;
    setSplitDocumentId(contextMenu.docId);
    setContextMenu(null);
  }, [contextMenu, setSplitDocumentId]);

  const contextDoc = contextMenu ? documents.find((d) => d.id === contextMenu.docId) : null;
  const canOpenInNewWindow = isTauriEnvironment();
  const canViewBeside = contextMenu != null && contextMenu.docId !== activeDocumentId2;

  return (
    <div
      className={`file-tab-bar${dockDropActive ? ' dock-drop-active' : ''}`}
      ref={tabBarRef}
      onDragOver={handleDockDragOver}
      onDragLeave={handleDockDragLeave}
      onDrop={handleDockDrop}
    >
      {documents.map((doc) => (
        <button
          key={doc.id}
          className={`file-tab${doc.id === activeDocumentId ? ' active' : ''}`}
          draggable
          onClick={() => setActiveDocument(doc.id)}
          onMouseDown={(e) => handleMiddleClick(e, doc.id)}
          onContextMenu={(e) => handleContextMenu(e, doc.id)}
          onDragStart={(e) => handleDragStart(e, doc)}
          onDragEnd={(e) => handleDragEnd(e)}
        >
          <span className="file-tab-label">
            {doc.fileName}
          </span>
          {doc.isModified && <span className="file-tab-modified">{'\u25CF'}</span>}
          <span
            className="file-tab-close"
            onMouseDown={handleCloseMouseDown}
            onClick={(e) => handleClose(e, doc.id)}
          >
            &times;
          </span>
        </button>
      ))}
      {documents.length === 0 && (
        <span className="file-tab-hint">{t("noDocumentOpen")}</span>
      )}
      <button className="file-tab-add" onClick={newFile} title={t("new") ?? 'New'}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
          <line x1="6" y1="2" x2="6" y2="10" />
          <line x1="2" y1="6" x2="10" y2="6" />
        </svg>
      </button>

      {/* Tab context menu */}
      {contextMenu && (
        <div
          ref={menuRef}
          className="grid-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            className="grid-context-menu-item"
            onClick={handleOpenInNewWindow}
            disabled={!canOpenInNewWindow}
            title={!canOpenInNewWindow ? (contextDoc?.filePath ? '' : t('saveFirst') ?? 'Sla het bestand eerst op') : ''}
          >
            <span>{t('openInNewWindow') ?? 'Open in nieuw venster'}</span>
          </button>
          <button
            className="grid-context-menu-item"
            onClick={handleViewBeside}
            disabled={!canViewBeside}
          >
            <span>{t('viewBeside') ?? 'Bekijk naast huidige'}</span>
          </button>
          <div className="grid-context-menu-separator" />
          <button className="grid-context-menu-item" onClick={handleCloseTab}>
            <span>{t('closeTab') ?? 'Tabblad sluiten'}</span>
          </button>
        </div>
      )}
    </div>
  );
};
