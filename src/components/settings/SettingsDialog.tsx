import { blueprintTheme } from '@/utils/blueprintTheme';
import { localStore } from '@/utils/browserStorage';
import { setHostAttribute } from "@/lib/hostRoot";
import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import i18next from "i18next";
import { LANGUAGES, changeLanguage } from "../../i18n/config";
import { useAppStore } from "../../state/appStore";
import Modal from "../common/Modal";
import "./SettingsDialog.css";

const THEME_OPTIONS = [
  { value: "light", labelKey: "appearance.light" },
  { value: "dark", labelKey: "appearance.dark" },
  { value: "blueprint", labelKey: "appearance.blueprint" },
  { value: "high-contrast-dark", labelKey: "appearance.highContrastDark" },
  { value: "high-contrast-light", labelKey: "appearance.highContrastLight" },
];

function getSystemTheme(): string {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveTheme(theme: string): string {
  return theme === "system" ? getSystemTheme() : theme;
}

export function applyTheme(theme: string) {
  const resolved = blueprintTheme(resolveTheme(theme));
  setHostAttribute("data-theme", resolved);
  setHostAttribute("data-oa-theme", resolved);
  try { localStore.setItem("ocs-theme", resolved); } catch { /* ignore */ }
}

/** Rapporttaal uit de instellingen: een bekende taalcode, anders "auto" (= volg de interface). */
function normalizeReportLang(code: string | undefined): string {
  return code && code !== "auto" && LANGUAGES.some((l) => l.code === code) ? code : "auto";
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
  const savedReportLocale = useAppStore((s) => s.settings.reportLocale);
  const [activeTab, setActiveTab] = useState("general");
  const [draftReportLang, setDraftReportLang] = useState(() => normalizeReportLang(savedReportLocale));
  const [draftTheme, setDraftTheme] = useState(blueprintTheme(theme));
  const [draftLang, setDraftLang] = useState(() => {
    // Map stored locale to language code
    const lang = i18next.language || savedLocale?.split("-")[0] || "auto";
    return LANGUAGES.some((l) => l.code === lang) ? lang : "auto";
  });
  const originalTheme = useRef(theme);

  useEffect(() => {
    if (open) {
      originalTheme.current = theme;
      setDraftTheme(blueprintTheme(theme));
      const lang = i18next.language || savedLocale?.split("-")[0] || "auto";
      setDraftLang(LANGUAGES.some((l) => l.code === lang) ? lang : "auto");
      setDraftReportLang(normalizeReportLang(savedReportLocale));
    }
  }, [open, theme, savedLocale, savedReportLocale]);

  const handleCancel = () => {
    setDraftTheme(originalTheme.current);
    onClose();
  };

  const handleSave = () => {
    onThemeChange(draftTheme);
    applyTheme(draftTheme);
    changeLanguage(draftLang);
    updateSettings({ locale: draftLang, reportLocale: draftReportLang });
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
              <div className="settings-row">
                <span className="settings-label">{t("general.reportLanguage")}</span>
                <select
                  className="settings-select"
                  value={draftReportLang}
                  onChange={(e) => setDraftReportLang(e.target.value)}
                  style={{ width: 180 }}
                >
                  <option value="auto">{t("general.reportLanguageAuto")}</option>
                  {LANGUAGES.filter((l) => l.code !== "auto").map((l) => (
                    <option key={l.code} value={l.code}>{l.name}</option>
                  ))}
                </select>
              </div>
              <p style={{ fontSize: 11, marginTop: 4, color: "var(--theme-dialog-content-secondary)" }}>
                {t("general.reportLanguageHelp")}
              </p>
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
                <p><strong>{t("about.license")}:</strong> LGPL-3.0-only</p>
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
