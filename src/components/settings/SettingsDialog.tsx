import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import i18next from "i18next";
import { LANGUAGES, changeLanguage } from "../../i18n/config";
import { useAppStore } from "../../state/appStore";
import Modal from "../common/Modal";
import "./SettingsDialog.css";

const THEME_OPTIONS = [
  { value: "default", labelKey: "appearance.default", swatches: ["#36363E", "#44444C", "#D97706", "#FAFAF9"] },
  { value: "light", labelKey: "appearance.light", swatches: ["#ffffff", "#f5f5f5", "#D97706", "#1a1a1a"] },
  { value: "dark", labelKey: "appearance.dark", swatches: ["#1a1a2e", "#242445", "#D97706", "#C4B199"] },
  { value: "blue", labelKey: "appearance.blue", swatches: ["#0d1b2a", "#1b263b", "#0077b6", "#e0e1dd"] },
  { value: "amber-navy", labelKey: "appearance.amberNavy", swatches: ["#1a1a2e", "#242445", "#D97706", "#C4B199"] },
  { value: "warm-ember", labelKey: "appearance.warmEmber", swatches: ["#3E3636", "#4a4242", "#D97706", "#F5F0EB"] },
  { value: "highContrast", labelKey: "appearance.highContrast", swatches: ["#000000", "#141414", "#ffff00", "#ffffff"] },
];

function getSystemTheme(): string {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveTheme(theme: string): string {
  return theme === "system" ? getSystemTheme() : theme;
}

export function applyTheme(theme: string) {
  const resolved = resolveTheme(theme);
  document.documentElement.setAttribute("data-theme", resolved);
  try { localStorage.setItem("ocs-theme", resolved); } catch { /* ignore */ }
}

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  theme: string;
  onThemeChange: (theme: string) => void;
}

export default function SettingsDialog({ open, onClose, theme, onThemeChange }: SettingsDialogProps) {
  const { t } = useTranslation("settings");
  const { t: tCommon } = useTranslation("common");
  const updateSettings = useAppStore((s) => s.updateSettings);
  const savedLocale = useAppStore((s) => s.settings.locale);
  const [activeTab, setActiveTab] = useState("general");
  const [draftTheme, setDraftTheme] = useState(theme);
  const [draftLang, setDraftLang] = useState(() => {
    // Map stored locale to language code
    const lang = i18next.language || savedLocale?.split("-")[0] || "auto";
    return LANGUAGES.some((l) => l.code === lang) ? lang : "auto";
  });
  const originalTheme = useRef(theme);

  useEffect(() => {
    if (open) {
      originalTheme.current = theme;
      setDraftTheme(theme);
      const lang = i18next.language || savedLocale?.split("-")[0] || "auto";
      setDraftLang(LANGUAGES.some((l) => l.code === lang) ? lang : "auto");
    }
  }, [open, theme, savedLocale]);

  const handleCancel = () => {
    setDraftTheme(originalTheme.current);
    onClose();
  };

  const handleSave = () => {
    onThemeChange(draftTheme);
    applyTheme(draftTheme);
    changeLanguage(draftLang);
    updateSettings({ locale: draftLang });
    onClose();
  };

  const TAB_IDS = ["general", "appearance", "grid", "files", "about"] as const;

  return (
    <Modal open={open} onClose={handleCancel} title={t("title")} className="settings-dialog">
      <div className="settings-body">
        <div className="settings-sidebar">
          {TAB_IDS.map((id) => (
            <button
              key={id}
              className={`settings-tab${activeTab === id ? " active" : ""}`}
              onClick={() => setActiveTab(id)}
            >
              {t(`tabs.${id}`)}
            </button>
          ))}
        </div>

        <div className="settings-content">
          {activeTab === "general" && (
            <div className="settings-section">
              <h3>{t("general.application")}</h3>
              <div className="settings-row">
                <span className="settings-label">{t("general.language")}</span>
                <select
                  className="settings-select"
                  value={draftLang}
                  onChange={(e) => setDraftLang(e.target.value)}
                  style={{ width: 180 }}
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>{l.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
          {activeTab === "appearance" && (
            <div className="settings-section">
              <h3>{t("appearance.theme")}</h3>
              <select
                className="settings-select"
                value={draftTheme}
                onChange={(e) => setDraftTheme(e.target.value)}
                style={{ width: 180 }}
              >
                {THEME_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
                ))}
              </select>
            </div>
          )}
          {activeTab === "about" && (
            <div className="settings-section">
              <h3>{t("about.appName")}</h3>
              <div style={{ fontSize: 11, lineHeight: 1.8 }}>
                <p><strong>{t("about.version")}:</strong> {__APP_VERSION__}</p>
                <p><strong>{t("about.framework")}:</strong> Tauri + React + TypeScript</p>
                <p><strong>{t("about.license")}:</strong> MIT</p>
                <p style={{ marginTop: 8, color: "var(--theme-dialog-content-secondary)" }}>{t("about.description")}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="settings-footer">
        <div className="settings-footer-right">
          <button className="settings-btn settings-btn-secondary" onClick={handleCancel}>{tCommon("cancel")}</button>
          <button className="settings-btn settings-btn-primary" onClick={handleSave}>{tCommon("save")}</button>
        </div>
      </div>
    </Modal>
  );
}
