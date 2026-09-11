/**
 * Rapporttaal: de taal van afdrukken en PDF-rapporten.
 *
 * Staat los van de interfacetaal (instelling `reportLocale`): "auto" volgt de
 * interface, een taalcode forceert die taal. Zo kan een Nederlands bureau met
 * een Engelse interface toch Nederlandse rapporten maken voor een Nederlandse
 * opdrachtgever.
 *
 * - TS-printservices gebruiken `getReportContext()` / `getReportT()`.
 * - De Rust-generators krijgen `getReportRequestLocale()` mee in het request:
 *   `labels` (de `report`-namespace plat plus `units.<code>`) en `numberFormat`
 *   (getal-, bedrag- en datumnotatie). Rust valt terug op Nederlands, dus
 *   zonder beide (CLI, MCP-server) blijft het rapport Nederlands.
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

/**
 * Getal-, bedrag- en datumnotatie voor de Rust-generators (veld
 * `numberFormat` in het rapportverzoek; zie src-tauri/src/reports/numfmt.rs).
 * Rust kent geen locales, dus we leiden hier de tekens en patronen af uit Intl.
 */
export interface ReportNumberFormat {
  decimal: string;
  group: string;
  /** Groepsgroottes van rechts: [3], of [3, 2] voor de Indiase notatie. */
  grouping: number[];
  /** 2 = pas scheiden vanaf vijf cijfers ("1234" maar "12.345"), zoals in het Spaans. */
  minGroupingDigits: number;
  minus: string;
  /** Patronen met `{{n}}` voor het getal zonder teken. */
  currency: string;
  currencyNegative: string;
  percent: string;
  /** Datumpatroon met DD, MM en YYYY, bv. "DD-MM-YYYY". */
  date: string;
}

// Harde spatie in plaats van smalle of dunne spaties (Frans, Zweeds, …): de
// PDF-lettertypes kennen U+00A0 zeker, U+202F niet altijd. Richtingstekens
// (LRM/RLM/ALM en isolates, Arabisch en Hebreeuws) weg: de PDF-engine heeft
// daar geen glyph voor.
const normalizeSpaces = (s: string): string =>
  s.replace(/[\u202F\u2009\u00A0]/g, "\u00A0").replace(/[\u200E\u200F\u061C\u202A-\u202E\u2066-\u2069]/g, "");

/** Patroon uit formatToParts: het getal (alle cijferdelen) wordt `{{n}}`. */
function toPattern(parts: Intl.NumberFormatPart[]): string {
  const numeric = new Set(["integer", "group", "decimal", "fraction"]);
  let out = "";
  let placed = false;
  for (const p of parts) {
    if (numeric.has(p.type)) {
      if (!placed) out += "{{n}}";
      placed = true;
    } else {
      out += p.value;
    }
  }
  return normalizeSpaces(out);
}

export function reportNumberFormat(intlLocale: string): ReportNumberFormat {
  // Latijnse cijfers: de PDF-lettertypes hebben niet elk cijferschrift
  // (Arabisch-Indisch, Bengaals, …), en in bestekken zijn ze gangbaar.
  const locale = `${intlLocale}-u-nu-latn`;
  const plain = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const parts = plain.formatToParts(-1234567890.5);
  const pick = (type: string, fallback: string) => parts.find((p) => p.type === type)?.value ?? fallback;

  // Groepsgroottes afleiden uit 1234567890: "1.234.567.890" of "1,23,45,67,890".
  const groups = parts.filter((p) => p.type === "integer").map((p) => p.value.length);
  const primary = groups.length > 1 ? groups[groups.length - 1] : 3;
  const secondary = groups.length > 2 ? groups[groups.length - 2] : primary;
  const grouping = secondary !== primary ? [primary, secondary] : [primary];
  const minGroupingDigits = plain.formatToParts(1234).some((p) => p.type === "group") ? 1 : 2;

  // narrowSymbol: overal "€", ook waar de locale "EUR" schrijft (hu, ro, uk).
  const money = new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", currencyDisplay: "narrowSymbol" });
  const percent = new Intl.NumberFormat(locale, { style: "percent" });

  // Datumvolgorde en scheidingstekens uit een datum met herkenbare delen.
  const dateParts = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric" })
    .formatToParts(new Date(2026, 10, 23));
  const date = dateParts
    .map((p) => (p.type === "day" ? "DD" : p.type === "month" ? "MM" : p.type === "year" ? "YYYY" : p.value))
    .join("");

  return {
    decimal: pick("decimal", "."),
    group: normalizeSpaces(pick("group", "")),
    grouping,
    minGroupingDigits,
    minus: pick("minusSign", "-"),
    currency: toPattern(money.formatToParts(1234.5)),
    currencyNegative: toPattern(money.formatToParts(-1234.5)),
    percent: toPattern(percent.formatToParts(0.5)),
    date: normalizeSpaces(date),
  };
}

/**
 * Wat elk Rust-rapportverzoek meekrijgt voor de rapporttaal: de teksten
 * (`labels`) en de notatie (`numberFormat`).
 */
export async function getReportRequestLocale(
  reportLocale?: string,
): Promise<{ labels: Record<string, string>; numberFormat: ReportNumberFormat }> {
  const lang = resolveReportLanguage(reportLocale);
  return { labels: await getReportLabels(lang), numberFormat: reportNumberFormat(intlLocaleFor(lang)) };
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
