/**
 * Wijzigingshistorie per begrotingsregel (CostItem). Legt bij elke veldwijziging
 * vast wat er veranderde (oude → nieuwe waarde), wanneer, en door welke Windows-
 * gebruiker. Wordt aangeroepen vanuit costItemsSlice.updateItem en in het
 * properties-paneel getoond.
 *
 * Pure functie (tijd komt als parameter binnen) zodat ze los te testen is.
 */
import type { CostItem, FieldChange } from '@/types/costModel';

/**
 * Velden die de moeite waard zijn om te volgen: door de gebruiker bewerkbare
 * waarden. Berekende velden (unitPrice, total) en structurele velden (depth,
 * sortOrder, isCollapsed, parentId, ifcGuid, id) worden bewust overgeslagen.
 */
const TRACKED_FIELDS = new Set<string>([
  'code', 'description', 'unit', 'quantity',
  'materialPrice', 'laborPrice', 'notes',
  'normQuantity', 'normFactor', 'normDivisor', 'normUnitPrice',
  'resourceType', 'tariefGroep', 'verrekenbaar', 'staartPercentage', 'nr',
]);

/** Opeenvolgende bewerkingen van hetzelfde veld binnen dit venster worden samengevoegd. */
const COALESCE_WINDOW_MS = 2 * 60 * 1000;
/** Bovengrens op het aantal entries per regel (oudste vervallen). */
const MAX_ENTRIES = 200;

export function shouldTrackField(field: string): boolean {
  return TRACKED_FIELDS.has(field);
}

/**
 * Of een regel "gewijzigd" is sinds het wijzigingen-bijhouden werd aangezet:
 * heeft ze een history-entry met een tijdstip op of na `since`? `since` leeg
 * (uit) → nooit gewijzigd. ISO-tijdstempels vergelijken lexicografisch correct.
 */
export function isItemChangedSince(
  item: Pick<CostItem, 'history'>,
  since: string | null | undefined,
): boolean {
  if (!since) return false;
  return item.history?.some((h) => h.timestamp >= since) ?? false;
}

/**
 * De verzameling veldnamen die sinds `since` gewijzigd zijn — voor cel-niveau
 * markering (alleen de gewijzigde cellen kleuren i.p.v. de hele regel).
 */
export function changedFieldsSince(
  item: Pick<CostItem, 'history'>,
  since: string | null | undefined,
): Set<string> {
  const out = new Set<string>();
  if (!since || !item.history) return out;
  for (const h of item.history) {
    if (h.timestamp >= since) out.add(h.field);
  }
  return out;
}

type Primitive = string | number | boolean | null;

/** Normaliseer een waarde naar een opslaanbare/vergelijkbare primitief. */
function norm(v: unknown): Primitive {
  if (v == null) return null;
  if (typeof v === 'object') return JSON.stringify(v);
  return v as Primitive;
}

/**
 * Geef de nieuwe historie-array terug ná het toepassen van een veldwijziging.
 * Retourneert de bestaande array (zelfde referentie) als er niets verandert.
 *
 * @param nowMs  huidige tijd in ms (Date.now() bij de aanroeper) — als parameter
 *               zodat deze functie puur en testbaar blijft.
 */
export function appendHistory(
  item: Pick<CostItem, 'history'>,
  field: string,
  oldValue: unknown,
  newValue: unknown,
  user: string,
  nowMs: number,
): FieldChange[] {
  const prev = item.history ?? [];
  const ov = norm(oldValue);
  const nv = norm(newValue);
  if (ov === nv) return prev; // geen echte wijziging

  const timestamp = new Date(nowMs).toISOString();
  const last = prev[prev.length - 1];

  // Samenvoegen: laatste entry is hetzelfde veld + gebruiker, binnen het venster.
  if (
    last &&
    last.field === field &&
    last.user === user &&
    nowMs - Date.parse(last.timestamp) < COALESCE_WINDOW_MS
  ) {
    // Terug naar de oorspronkelijke waarde van die entry → entry vervalt.
    if (last.oldValue === nv) return prev.slice(0, -1);
    const merged: FieldChange = { ...last, newValue: nv, timestamp };
    return [...prev.slice(0, -1), merged];
  }

  const next = [...prev, { field, oldValue: ov, newValue: nv, timestamp, user }];
  return next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next;
}
