import i18next, { type TFunction } from "i18next";

/**
 * Toon een eenheid in de taal van de gebruiker.
 *
 * De eenheden in het kostenmodel (CostUnit: 'st', 'uur', 'dgn', 'mnd', …) zijn
 * Nederlandse OPSLAGcodes. Die blijven in bestanden, import/export en
 * round-trips ongewijzigd; alleen voor weergave worden ze via de namespace
 * `units` vertaald. Onbekende codes (bv. vrije tekst uit een oudere import)
 * komen ongewijzigd terug.
 *
 * Geef bij voorkeur de `t` van `useTranslation()` mee: dan tekent het
 * component opnieuw bij een taalwissel. Zonder `t` wordt de globale
 * i18next-instantie gebruikt.
 */
export function formatUnit(unit: string | null | undefined, t?: TFunction): string {
  if (unit === null || unit === undefined) return "";
  const code = String(unit);
  if (code.trim() === "") return code;
  const translate = t ?? (i18next.t.bind(i18next) as TFunction);
  try {
    const out = translate(code, {
      ns: "units",
      defaultValue: code,
      // Eenheden als "m²" of een vrije tekst met punt/dubbele punt mogen
      // niet als genest pad of namespace-prefix gelezen worden.
      keySeparator: false,
      nsSeparator: false,
    });
    return typeof out === "string" && out !== "" ? out : code;
  } catch {
    // i18next niet geïnitialiseerd (bv. in tests): toon de code zelf.
    return code;
  }
}
