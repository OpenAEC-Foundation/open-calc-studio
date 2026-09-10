import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

// Nederlands en Engels zijn de bronvertalingen: die worden altijd meegebundeld
// (Engels is de fallback, dus moet synchroon beschikbaar zijn bij init). De
// overige talen worden pas opgehaald wanneer ze gekozen of gedetecteerd
// worden — anders belandt elke taal in de entry-chunk en wordt het opstarten
// onnodig traag.
import enCommon from "./locales/en/common.json";
import enRibbon from "./locales/en/ribbon.json";
import enBackstage from "./locales/en/backstage.json";
import enSettings from "./locales/en/settings.json";
import enFeedback from "./locales/en/feedback.json";
import enGrid from "./locales/en/grid.json";
import enDialogs from "./locales/en/dialogs.json";
import enReleases from "./locales/en/releases.json";
import nlCommon from "./locales/nl/common.json";
import nlRibbon from "./locales/nl/ribbon.json";
import nlBackstage from "./locales/nl/backstage.json";
import nlSettings from "./locales/nl/settings.json";
import nlFeedback from "./locales/nl/feedback.json";
import nlGrid from "./locales/nl/grid.json";
import nlDialogs from "./locales/nl/dialogs.json";
import nlReleases from "./locales/nl/releases.json";

export interface LanguageDef {
  code: string;
  /** Naam in de taal zelf — zo herkent een gebruiker zijn eigen taal. */
  name: string;
  englishName: string;
  dir?: "rtl";
}

export const LANGUAGES: LanguageDef[] = [
  { code: "auto", name: "Auto-detect", englishName: "Auto-detect" },
  { code: "ar", name: "العربية", englishName: "Arabic", dir: "rtl" },
  { code: "bn", name: "বাংলা", englishName: "Bengali" },
  { code: "bg", name: "Български", englishName: "Bulgarian" },
  { code: "ca", name: "Català", englishName: "Catalan" },
  { code: "zh", name: "中文", englishName: "Chinese" },
  { code: "hr", name: "Hrvatski", englishName: "Croatian" },
  { code: "cs", name: "Čeština", englishName: "Czech" },
  { code: "da", name: "Dansk", englishName: "Danish" },
  { code: "nl", name: "Nederlands", englishName: "Dutch" },
  { code: "en", name: "English", englishName: "English" },
  { code: "fa", name: "فارسی", englishName: "Farsi", dir: "rtl" },
  { code: "fi", name: "Suomi", englishName: "Finnish" },
  { code: "fr", name: "Français", englishName: "French" },
  { code: "de", name: "Deutsch", englishName: "German" },
  { code: "el", name: "Ελληνικά", englishName: "Greek" },
  { code: "he", name: "עברית", englishName: "Hebrew", dir: "rtl" },
  { code: "hi", name: "हिन्दी", englishName: "Hindi" },
  { code: "hu", name: "Magyar", englishName: "Hungarian" },
  { code: "id", name: "Bahasa Indonesia", englishName: "Indonesian" },
  { code: "it", name: "Italiano", englishName: "Italian" },
  { code: "ja", name: "日本語", englishName: "Japanese" },
  { code: "ko", name: "한국어", englishName: "Korean" },
  { code: "ms", name: "Bahasa Melayu", englishName: "Malay" },
  { code: "nb", name: "Norsk", englishName: "Norwegian" },
  { code: "pl", name: "Polski", englishName: "Polish" },
  { code: "pt", name: "Português", englishName: "Portuguese" },
  { code: "ro", name: "Română", englishName: "Romanian" },
  { code: "ru", name: "Русский", englishName: "Russian" },
  { code: "sr", name: "Српски", englishName: "Serbian" },
  { code: "sk", name: "Slovenčina", englishName: "Slovak" },
  { code: "es", name: "Español", englishName: "Spanish" },
  { code: "sw", name: "Kiswahili", englishName: "Swahili" },
  { code: "sv", name: "Svenska", englishName: "Swedish" },
  { code: "ta", name: "தமிழ்", englishName: "Tamil" },
  { code: "th", name: "ไทย", englishName: "Thai" },
  { code: "tr", name: "Türkçe", englishName: "Turkish" },
  { code: "uk", name: "Українська", englishName: "Ukrainian" },
  { code: "ur", name: "اردو", englishName: "Urdu", dir: "rtl" },
  { code: "vi", name: "Tiếng Việt", englishName: "Vietnamese" },
];

export const RTL_LANGUAGES = ["ar", "fa", "he", "ur"];

export function isRTL(lang: string): boolean {
  return RTL_LANGUAGES.includes(lang.split("-")[0]);
}

const ns = ["common", "ribbon", "backstage", "settings", "feedback", "grid", "dialogs", "releases"];

// Alle locale-bestanden als lazy importers; Vite splitst ze in aparte chunks.
const localeModules = import.meta.glob("./locales/*/*.json") as Record<
  string,
  () => Promise<{ default: Record<string, unknown> }>
>;

const loadedLanguages = new Set(["en", "nl"]);

function isKnownLanguage(lng: string): boolean {
  return LANGUAGES.some((l) => l.code === lng);
}

/**
 * Haal de namespace-bundels voor één taal op en registreer ze bij i18next.
 * Idempotent; onbekende codes en al geladen talen doen niets. Ontbrekende
 * namespace-bestanden worden overgeslagen — die vallen dan terug op Engels.
 */
export async function loadLocale(lng: string): Promise<void> {
  const base = (lng || "").split("-")[0];
  if (!base || loadedLanguages.has(base) || !isKnownLanguage(base)) return;
  await Promise.all(
    ns.map(async (n) => {
      const importer = localeModules[`./locales/${base}/${n}.json`];
      if (!importer) return;
      try {
        const mod = await importer();
        i18next.addResourceBundle(base, n, mod.default ?? mod, true, true);
      } catch (err) {
        console.warn(`[i18n] Kan ${base}/${n}.json niet laden:`, err);
      }
    }),
  );
  loadedLanguages.add(base);
}

i18next
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { common: enCommon, ribbon: enRibbon, backstage: enBackstage, settings: enSettings, feedback: enFeedback, grid: enGrid, dialogs: enDialogs, releases: enReleases },
      nl: { common: nlCommon, ribbon: nlRibbon, backstage: nlBackstage, settings: nlSettings, feedback: nlFeedback, grid: nlGrid, dialogs: nlDialogs, releases: nlReleases },
    },
    ns,
    defaultNS: "common",
    // Geen vaste lng: de LanguageDetector kiest de opgeslagen voorkeur of
    // anders de browsertaal. Niet-ondersteunde talen vallen terug op Engels
    // — Nederlands alleen wanneer daar expliciet voor gekozen is.
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "i18nextLng",
      caches: ["localStorage"],
    },
    react: {
      // Cruciaal bij lazy geladen talen: react-i18next hertekent standaard
      // alleen bij een taalwissel, niet wanneer er ná init vertaalbestanden
      // bíjkomen. Zonder dit blijft een taal die niet is meegebundeld bij het
      // opstarten in het Engels staan tot de gebruiker handmatig wisselt.
      bindI18nStore: "added",
    },
  });

// De gedetecteerde taal is bij init nog niet geladen als het niet en/nl is;
// haal hem alsnog op zodat de UI meteen in de juiste taal verschijnt.
void loadLocale(i18next.language);

i18next.on("languageChanged", (lng) => {
  document.documentElement.setAttribute("lang", lng);
  // RTL-talen (Arabisch, Farsi, Hebreeuws, Urdu) spiegelen de hele layout.
  document.documentElement.setAttribute("dir", isRTL(lng) ? "rtl" : "ltr");
});

/**
 * Wissel van taal. Laadt de vertaalbestanden eerst, zodat de UI niet eerst
 * kort in het Engels flitst. "auto" volgt de browsertaal (met Engels als
 * terugval wanneer die taal niet beschikbaar is).
 */
export async function changeLanguage(lang: string): Promise<unknown> {
  let target = lang;
  if (lang === "auto") {
    const detected = navigator.language?.split("-")[0] || "en";
    target = isKnownLanguage(detected) ? detected : "en";
  }
  await loadLocale(target);
  return i18next.changeLanguage(target);
}

export default i18next;
