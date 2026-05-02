import { useTranslation } from "react-i18next";
import Modal from "./Modal";
import "./UnsavedChangesDialog.css";

export type UnsavedResult = "save" | "discard" | "cancel";

interface UnsavedChangesDialogProps {
  open: boolean;
  fileName: string;
  onResult: (result: UnsavedResult) => void;
}

export default function UnsavedChangesDialog({ open, fileName, onResult }: UnsavedChangesDialogProps) {
  const { t } = useTranslation();

  return (
    <Modal open={open} onClose={() => onResult("cancel")} title={t("appName")} className="unsaved-dialog">
      <div className="unsaved-body">
        <div className="unsaved-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--theme-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>
        <p className="unsaved-message">{t("unsavedChangesPrompt", { name: fileName })}</p>
      </div>
      <div className="unsaved-footer">
        <button className="unsaved-btn unsaved-btn-primary" onClick={() => onResult("save")}>{t("save")}</button>
        <button className="unsaved-btn unsaved-btn-secondary" onClick={() => onResult("discard")}>{t("dontSave")}</button>
        <button className="unsaved-btn unsaved-btn-secondary" onClick={() => onResult("cancel")}>{t("cancel")}</button>
      </div>
    </Modal>
  );
}

// Promise-based helper for imperative usage
let _resolve: ((result: UnsavedResult) => void) | null = null;
let _setState: ((state: { open: boolean; fileName: string }) => void) | null = null;

export function registerUnsavedDialogSetter(setter: typeof _setState) {
  _setState = setter;
}

export function showUnsavedChangesDialog(fileName: string): Promise<UnsavedResult> {
  return new Promise((resolve) => {
    _resolve = resolve;
    _setState?.({ open: true, fileName });
  });
}

export function handleUnsavedResult(result: UnsavedResult) {
  _setState?.({ open: false, fileName: "" });
  _resolve?.(result);
  _resolve = null;
}
