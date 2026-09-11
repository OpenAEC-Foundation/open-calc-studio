/**
 * Rapporttaal: de taal van afdrukken en PDF-rapporten.
 *
 * Staat los van de interfacetaal (instelling `reportLocale`): "auto" volgt de
 * interface, een taalcode forceert die taal. Zo kan een Nederlands bureau met
 * een Engelse interface toch Nederlandse rapporten maken voor een Nederlandse
 * opdrachtgever.
 *
 * - TS-printservices gebruiken `getReportContext()` / `getReportT()`.
 * - De Rust-generators krijgen `getReportLabels()` mee in het request: de hele
 *   `report`-namespace plat (keys met punten) plus `units.<code>`. Rust valt per
 *   key terug op de Nederlandse tekst, dus zonder labels (CLI, MCP-server)
 *   blijft alles Nederlands.
 */
import i18next, { type TFunction } from "i18next";
import { LANGUAGES, loadLocale } from "./config";
import { formatUnit } from "./formatUnit";
import { useAppStore } from "@/state/appStore";

export type ReportT = TFunction;

export interface ReportContext {
  /** Taalcode van het rapport (basiscode, bv. "nl", "en", "es"). */
  lang: string;
  /** Locale voor Intl-getal- en datumnotatie (bv. "nl-NL"). */
  intlLocale: string;
  /** Vertaalfunctie op de `report`-namespace in de rapporttaal. */
  t: ReportT;
  /** Eenheidscode (st, m², uur, …) in de rapporttaal; onbekend = ongewijzigd. */
  unit: (code: string | null | undefined) => string;
}

function isReportLanguage(code: string): boolean {
  return code !== "auto" && LANGUAGES.some((l) => l.code === code);
}

/**
 * De taal waarin rapporten verschijnen: de instelling `reportLocale`, of bij
 * "auto" de huidige interfacetaal. Onbekende talen vallen terug op Engels
 * (net als de interface).
 */
export function resolveReportLanguage(reportLocale?: string): string {
  const setting = reportLocale ?? useAppStore.getState().settings?.reportLocale ?? "auto";
  const raw = setting && setting !== "auto" ? setting : i18next.language || "en";
  const base = raw.split("-")[0];
  return isReportLanguage(base) ? base : "en";
}

/** Intl-locale voor getallen en datums in de rapporttaal. */
export function intlLocaleFor(lang: string): string {
  switch (lang) {
    case "nl": return "nl-NL";
    // Europese datumvolgorde (dd/mm/jjjj) voor Engelstalige rapporten
    case "en": return "en-GB";
    default: return lang;
  }
}

/**
 * Bouw de rapportcontext synchroon op basis van wat al geladen is. Nederlands
 * en Engels zijn altijd geladen; een andere taal valt terug op Engels zolang
 * zijn bestanden nog niet binnen zijn — gebruik bij voorkeur de async variant.
 */
export function makeReportContext(lang: string = resolveReportLanguage()): ReportContext {
  const t = i18next.getFixedT(lang, "report");
  // Zelfde weergave als in het grid (formatUnit), maar in de rapporttaal.
  const tLang = i18next.getFixedT(lang);
  const unit = (code: string | null | undefined): string => formatUnit(code, tLang);
  return { lang, intlLocale: intlLocaleFor(lang), t, unit };
}

/** Rapportcontext in de rapporttaal; laadt die taal eerst indien nodig. */
export async function getReportContext(reportLocale?: string): Promise<ReportContext> {
  const lang = resolveReportLanguage(reportLocale);
  await loadLocale(lang);
  return makeReportContext(lang);
}

/** Vertaalfunctie op de `report`-namespace in de rapporttaal. */
export async function getReportT(reportLocale?: string): Promise<ReportT> {
  return (await getReportContext(reportLocale)).t;
}

function flatten(obj: unknown, prefix: string, out: Record<string, string>): void {
  if (obj == null || typeof obj !== "object") return;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out[key] = v;
    else if (v && typeof v === "object") flatten(v, key, out);
  }
}

function bundle(lang: string, ns: string): Record<string, string> {
  const out: Record<string, string> = {};
  flatten(i18next.getResourceBundle(lang, ns), "", out);
  return out;
}

/**
 * Alle rapportteksten in de rapporttaal als platte map voor de Rust-
 * generators: `report`-keys met punten ("totals.contractSumExclVat") plus
 * `units.<code>`. Ontbrekende vertalingen vallen terug op Engels, net als in
 * de interface. Placeholders ({{page}}, {{pct}}, …) blijven staan; Rust en
 * Typst vullen ze zelf in.
 */
export async function getReportLabels(reportLocale?: string): Promise<Record<string, string>> {
  const lang = resolveReportLanguage(reportLocale);
  await loadLocale(lang);
  const labels: Record<string, string> = { ...bundle("en", "report"), ...bundle(lang, "report") };
  const units = { ...bundle("en", "units"), ...bundle(lang, "units") };
  for (const [code, label] of Object.entries(units)) labels[`units.${code}`] = label;
  return labels;
}

// Een rapporttaal die afwijkt van de interface moet ook voor de synchrone
// builders klaarstaan: laad hem zodra de instelling (bij opstarten of in het
// instellingenvenster) verandert.
useAppStore.subscribe((state, prev) => {
  const next = state.settings?.reportLocale;
  if (next && next !== prev.settings?.reportLocale && next !== "auto") {
    void loadLocale(next);
  }
});
