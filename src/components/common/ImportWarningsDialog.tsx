import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import type { ImportWarningCode } from "@/services/importers/types";
import "./Modal.css";
import "./ImportWarningsDialog.css";

/**
 * Niet-blokkerend paneel dat na een import de meldingen van de importer toont.
 *
 * Importers geven `warnings` (leesbare tekst) en optioneel `warningCodes`
 * (parallel aan `warnings`) terug. Voor een melding mét code wordt
 * `dialogs:importWarnings.<format>.<code>` vertaald, met de parameters als
 * interpolatiewaarden; ontbreekt die vertaling, dan valt het paneel terug op
 * de oorspronkelijke tekst.
 *
 * Aanroepen via `showImportWarnings(result, bestandsnaam)`. Het paneel hangt
 * zichzelf aan <body>, zodat het ook zichtbaar blijft wanneer het scherm dat
 * de import startte (bv. de backstage) direct daarna sluit.
 */

export interface ImportWarningsPayload {
  warnings?: string[];
  warningCodes?: ImportWarningCode[];
  /** Formaat-aanduiding van de importer ('bc3', 'cuf', …); bepaalt de vertaalsleutels. */
  format?: string;
}

/**
 * Zet de meldingen om naar tekst in de taal van de gebruiker. Meldingen
 * zonder code (of zonder formaat) blijven zoals de importer ze schreef.
 */
export function describeImportWarnings(payload: ImportWarningsPayload, t: TFunction): string[] {
  const warnings = payload.warnings ?? [];
  const codes = payload.warningCodes ?? [];
  const format = payload.format;
  return warnings.map((text, i) => {
    const c = codes[i];
    if (!c || !format) return text;
    const out = t(`importWarnings.${format}.${c.code}`, {
      ...(c.params ?? {}),
      ns: "dialogs",
      defaultValue: text,
    });
    return typeof out === "string" && out !== "" ? out : text;
  });
}

// ── Minimale store: één actieve set meldingen (de laatste import wint) ──

interface WarningsState {
  id: number;
  source: string;
  payload: ImportWarningsPayload;
}

let current: WarningsState | null = null;
let nextId = 1;
const listeners = new Set<() => void>();

function setCurrent(next: WarningsState | null): void {
  current = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function getSnapshot(): WarningsState | null {
  return current;
}

let hostRoot: Root | null = null;

function ensureHostMounted(): void {
  if (hostRoot || typeof document === "undefined") return;
  const el = document.createElement("div");
  el.id = "import-warnings-root";
  document.body.appendChild(el);
  hostRoot = createRoot(el);
  hostRoot.render(<ImportWarningsHost />);
}

/**
 * Toon de meldingen van een import. Doet niets als er geen meldingen zijn.
 * Geeft terug of het paneel getoond wordt.
 *
 * @param source bestandsnaam of formaatnaam, voor in de introductietekst
 */
export function showImportWarnings(payload: ImportWarningsPayload | null | undefined, source: string): boolean {
  if (!payload?.warnings || payload.warnings.length === 0) return false;
  setCurrent({ id: nextId++, source, payload });
  ensureHostMounted();
  return true;
}

export function closeImportWarnings(): void {
  setCurrent(null);
}

/** Houdt de lijst met meldingen bij en rendert het paneel zolang er iets te tonen is. */
export function ImportWarningsHost() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  if (!state) return null;
  return <ImportWarningsPanel key={state.id} source={state.source} payload={state.payload} onClose={closeImportWarnings} />;
}

interface PanelProps {
  source: string;
  payload: ImportWarningsPayload;
  onClose: () => void;
}

export function ImportWarningsPanel({ source, payload, onClose }: PanelProps) {
  const { t } = useTranslation("dialogs");
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lines = describeImportWarnings(payload, t);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setOpen(true));
    return () => {
      cancelAnimationFrame(raf);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    };
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard?.writeText(`${source}\n${lines.map((l) => `- ${l}`).join("\n")}`);
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      /* klembord niet beschikbaar — niets aan de hand */
    }
  };

  return (
    <div
      className={`import-warnings-panel${open ? " import-warnings-open" : ""}`}
      role="dialog"
      aria-modal="false"
      aria-labelledby="import-warnings-title"
      onKeyDown={(e) => {
        if (e.key === "Escape") { e.stopPropagation(); onClose(); }
      }}
    >
      <div className="modal-header">
        <h2 id="import-warnings-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--theme-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          {t("importWarnings.title")}
        </h2>
        <button className="modal-close-btn" onClick={onClose} aria-label={t("importWarnings.close")}>&times;</button>
      </div>
      <div className="import-warnings-body">
        <p className="import-warnings-intro">
          {t("importWarnings.intro", { count: lines.length, source })}
        </p>
        <ul className="import-warnings-list">
          {lines.map((line, i) => <li key={i}>{line}</li>)}
        </ul>
      </div>
      <div className="import-warnings-footer">
        <button className="import-warnings-btn import-warnings-btn-secondary" onClick={handleCopy}>
          {copied ? t("importWarnings.copied") : t("importWarnings.copy")}
        </button>
        <button className="import-warnings-btn import-warnings-btn-primary" onClick={onClose}>
          {t("importWarnings.close")}
        </button>
      </div>
    </div>
  );
}

export default ImportWarningsPanel;
