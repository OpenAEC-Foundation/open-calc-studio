// Datums als JJJJ-MM-DD in de lokale tijdzone. `toISOString()` geeft de
// UTC-datum, die rond middernacht een dag afwijkt (knownbug 124), en
// `new Date('2026-01-15')` leest als UTC-middernacht, wat ten westen van
// Greenwich de dag ervoor is.

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Lokale datum als `JJJJ-MM-DD` (standaard: vandaag). */
export function localIsoDate(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** `JJJJ-MM-DD` als lokale datum (middernacht); null bij een ongeldige waarde. */
export function parseLocalIsoDate(value: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '');
  if (!m) return null;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return date.getMonth() === Number(m[2]) - 1 ? date : null;
}

/**
 * Datum in de kop van een afdruk: de instelling "Rapportdatum"
 * (`schedule.reportDate`) of, zonder (geldige) datum, vandaag. Zo volgt de
 * webafdruk dezelfde datum als de PDF uit Rust (knownbug 126).
 */
export function formatReportDate(reportDate: string | null | undefined, intlLocale: string): string {
  const date = parseLocalIsoDate(reportDate) ?? new Date();
  return date.toLocaleDateString(intlLocale, { day: '2-digit', month: '2-digit', year: 'numeric' });
}
