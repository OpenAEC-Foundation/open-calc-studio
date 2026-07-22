import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "../../state/appStore";
import { useFileOperations } from "../../hooks/useFileOperations";
import { OPENAEC_ENABLED } from "../../services/buildFlags";
import "./TitleBar.css";

interface TitleBarProps {
  onSettingsClick?: () => void;
  onFeedbackClick?: () => void;
}

function TitleBar({ onSettingsClick, onFeedbackClick }: TitleBarProps) {
  const { t } = useTranslation();
  const { undo, redo, setItems } = useAppStore();
  const { saveFile } = useFileOperations();
  const undoAvailable = useAppStore((s) => s.undoStack.length > 0);
  const redoAvailable = useAppStore((s) => s.redoStack.length > 0);
  const activeDoc = useAppStore((s) => s.documents.find((d) => d.id === s.activeDocumentId));
  const [isMaximized, setIsMaximized] = useState(false);
  const [isMacOS, setIsMacOS] = useState(false);
  const isTauri = '__TAURI_INTERNALS__' in window;
  const appWindowRef = useRef<any>(null);

  // OpenAEC-account (login via Rust/OIDC; tokens blijven in de keyring)
  const accountsUser = useAppStore((s) => s.accountsUser);
  const accountsBusy = useAppStore((s) => s.accountsBusy);
  const accountsSignIn = useAppStore((s) => s.accountsSignIn);
  const accountsSignOut = useAppStore((s) => s.accountsSignOut);
  const accountsLoadUser = useAppStore((s) => s.accountsLoadUser);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  useEffect(() => { void accountsLoadUser(); }, [accountsLoadUser]);

  useEffect(() => {
    if (!accountMenuOpen) return;
    const close = () => setAccountMenuOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [accountMenuOpen]);

  const accountInitials = accountsUser
    ? (accountsUser.name || accountsUser.email)
        .split(/[\s@.]+/)
        .filter(Boolean)
        .map((p) => p[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : '';

  const handleSignIn = async () => {
    try {
      await accountsSignIn();
    } catch (e) {
      alert(`${t('accounts.signInFailed')}: ${e}`);
    }
  };

  // Detect macOS platform.
  //
  // Eerst de user agent: die is er altijd en kan niet stilvallen. De
  // os-plugin bevestigt het daarna. Eerder hing dit uitsluitend op de
  // plugin; die was niet in Rust geregistreerd, dus de aanroep gooide een
  // fout die in de lege catch verdween — macOS werd nooit herkend en de
  // titelbalk liet geen ruimte voor de stoplichtknoppen.
  useEffect(() => {
    if (/Mac|iPhone|iPad/i.test(navigator.userAgent)) setIsMacOS(true);
    (async () => {
      try {
        const { platform } = await import("@tauri-apps/plugin-os");
        setIsMacOS(platform() === "macos");
      } catch (e) {
        console.warn('[titlebar] platformdetectie via os-plugin mislukt, user agent gebruikt', e);
      }
    })();
  }, []);

  const handleUndo = useCallback(() => {
    const restored = undo();
    if (restored) setItems(restored);
  }, [undo, setItems]);

  const handleRedo = useCallback(() => {
    const restored = redo();
    if (restored) setItems(restored);
  }, [redo, setItems]);

  const getWindow = useCallback(async () => {
    if (!appWindowRef.current) {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        appWindowRef.current = getCurrentWindow();
      } catch { return null; }
    }
    return appWindowRef.current;
  }, []);

  const updateMaximizedState = useCallback(async () => {
    try {
      const win = await getWindow();
      if (win) setIsMaximized(await win.isMaximized());
    } catch {}
  }, [getWindow]);

  useEffect(() => {
    updateMaximizedState();
    let cleanup: (() => void) | undefined;
    getWindow()
      .then((win) => win?.onResized(() => updateMaximizedState()))
      .then((unlisten) => { cleanup = unlisten; })
      .catch(() => {});
    return () => { cleanup?.(); };
  }, [updateMaximizedState, getWindow]);

  // Update native window title for taskbar
  useEffect(() => {
    if (!activeDoc) return;
    const title = `${activeDoc.isModified ? '\u2022 ' : ''}${activeDoc.fileName} - Open Calc Studio`;
    getWindow().then((win) => win?.setTitle(title)).catch(() => {});
  }, [activeDoc?.fileName, activeDoc?.isModified, getWindow]);

  const handleMinimize = async () => (await getWindow())?.minimize();
  const handleMaximize = async () => (await getWindow())?.toggleMaximize();
  const handleClose = async () => (await getWindow())?.close();

  // Show Windows 11 Snap Layouts on maximize button hover
  const invokeRef = useRef<((cmd: string) => Promise<void>) | null>(null);
  useEffect(() => {
    import("@tauri-apps/api/core").then((m) => { invokeRef.current = m.invoke; }).catch(() => {});
  }, []);

  const snapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMaximizeHover = useCallback(() => {
    if (snapTimerRef.current) clearTimeout(snapTimerRef.current);
    snapTimerRef.current = setTimeout(() => {
      if (!document.hasFocus()) return;
      invokeRef.current?.("plugin:decorum|show_snap_overlay")?.catch(() => {});
    }, 500);
  }, []);

  const handleMaximizeLeave = useCallback(() => {
    if (snapTimerRef.current) {
      clearTimeout(snapTimerRef.current);
      snapTimerRef.current = null;
    }
  }, []);

  const handleDoubleClick = async (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    (await getWindow())?.toggleMaximize();
  };

  return (
    <div className={`titlebar${isMacOS ? ' titlebar-macos' : ''}`} onDoubleClick={handleDoubleClick}>
      <div className="titlebar-drag" data-tauri-drag-region />

      <div className="titlebar-left">
        <div className="titlebar-icon">
          <img src="/app-icon.svg" alt="" width="16" height="16" draggable={false} />
        </div>

        <div className="titlebar-quick-access">
          <button className="titlebar-quick-btn" title={`${t("save")} (Ctrl+S)`} aria-label={t("save")} tabIndex={-1} onClick={() => void saveFile()}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" />
              <polyline points="7 3 7 8 15 8" />
            </svg>
          </button>
          <button className={`titlebar-quick-btn${!undoAvailable ? ' disabled' : ''}`} title={`${t("undo")} (Ctrl+Z)`} aria-label={t("undo")} tabIndex={-1} onClick={handleUndo} disabled={!undoAvailable}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
            </svg>
          </button>
          <button className={`titlebar-quick-btn${!redoAvailable ? ' disabled' : ''}`} title={`${t("redo")} (Ctrl+Y)`} aria-label={t("redo")} tabIndex={-1} onClick={handleRedo} disabled={!redoAvailable}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 11-2.13-9.36L23 10" />
            </svg>
          </button>
          <button className="titlebar-quick-btn" title={t("preferences")} aria-label={t("preferences")} tabIndex={-1} onClick={onSettingsClick}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
          </button>
        </div>
      </div>

      <span className="titlebar-title" data-tauri-drag-region>
        {activeDoc ? `${activeDoc.isModified ? '\u2022 ' : ''}${activeDoc.fileName} - ` : ''}{t("appName")} <span className="titlebar-version">v{__APP_VERSION__}</span>
      </span>

      <div className="titlebar-controls">
        {OPENAEC_ENABLED && accountsUser ? (
          <div className="openaec-account" onClick={(e) => e.stopPropagation()}>
            <button
              className="openaec-avatar-btn"
              onClick={() => setAccountMenuOpen((v) => !v)}
              title={accountsUser.email}
              tabIndex={-1}
            >
              <span className="openaec-avatar">{accountInitials}</span>
              <span className="openaec-account-name">{accountsUser.name || accountsUser.email}</span>
            </button>
            {accountMenuOpen && (
              <div className="openaec-account-menu">
                <div className="openaec-account-menu-header">
                  <div className="openaec-account-menu-name">{accountsUser.name}</div>
                  <div className="openaec-account-menu-email">{accountsUser.email}</div>
                </div>
                <button
                  className="openaec-account-menu-item"
                  onClick={() => {
                    setAccountMenuOpen(false);
                    // Dev-portal; wordt later configureerbaar per omgeving
                    import('@tauri-apps/plugin-opener')
                      .then((m) => m.openUrl('http://localhost:3000'))
                      .catch(() => { window.open('http://localhost:3000', '_blank'); });
                  }}
                >
                  {t('accounts.openPortal')}
                </button>
                <button
                  className="openaec-account-menu-item"
                  onClick={() => { setAccountMenuOpen(false); void accountsSignOut(); }}
                >
                  {t('accounts.signOut')}
                </button>
              </div>
            )}
          </div>
        ) : OPENAEC_ENABLED ? (
          <button className="openaec-signin-btn" onClick={handleSignIn} disabled={accountsBusy} tabIndex={-1}>
            {accountsBusy ? t('accounts.signingIn') : t('accounts.signIn')}
          </button>
        ) : null}
        <button className="send-feedback-btn" onClick={onFeedbackClick} tabIndex={-1}>
          {t("sendFeedback")}
        </button>
        {isTauri && !isMacOS && (
          <>
            <button className="titlebar-button titlebar-minimize" onClick={handleMinimize} title={t("minimize")} aria-label={t("minimize")} tabIndex={-1}>
              <svg width="12" height="1" viewBox="0 0 12 1"><line x1="0" y1="0.5" x2="12" y2="0.5" stroke="currentColor" strokeWidth="1" /></svg>
            </button>
            <button
              className="titlebar-button titlebar-maximize"
              onClick={handleMaximize}
              onMouseEnter={handleMaximizeHover}
              onMouseLeave={handleMaximizeLeave}
              aria-label={isMaximized ? t("restore") : t("maximize")}
              tabIndex={-1}
            >
              {isMaximized ? (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
                  <rect x="0" y="2" width="7" height="7" rx="1" />
                  <polyline points="3,2 3,0.5 9.5,0.5 9.5,7 8,7" />
                </svg>
              ) : (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
                  <rect x="0.5" y="0.5" width="9" height="9" rx="1" />
                </svg>
              )}
            </button>
            <button className="titlebar-button titlebar-close" onClick={handleClose} title={t("close")} aria-label={t("close")} tabIndex={-1}>
              <svg width="12" height="12" viewBox="0 0 10 10">
                <line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" strokeWidth="1.2" />
                <line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" strokeWidth="1.2" />
              </svg>
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default TitleBar;
