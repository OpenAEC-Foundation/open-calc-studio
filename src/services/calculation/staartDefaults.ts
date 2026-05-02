import type { CostItem, RowType } from '@/types/costModel';

/** Build a single staart_* CostItem with sensible defaults. */
export function makeStaartItem(
  rowType: RowType,
  description: string,
  pct: number | null,
  sortOrder: number,
): CostItem {
  return {
    id: crypto.randomUUID(),
    parentId: null,
    sortOrder,
    code: '',
    description,
    unit: pct !== null ? '%' : 'st',
    quantity: pct,
    materialPrice: null,
    laborPrice: null,
    unitPrice: 0,
    total: 0,
    isCollapsed: false,
    depth: 0,
    notes: '',
    ifcGuid: '',
    rowType,
    staartPercentage: pct,
    nr: '',
    normQuantity: null,
    normFactor: null,
    normDivisor: null,
    normUnitPrice: null,
    resourceType: null,
    resourceLibraryId: null,
    verrekenbaar: null,
    tariefGroep: null,
  };
}

interface CachedStaartRow {
  label?: string;
  percentage?: number | null;
}

/** Try to find a cached staart row's percentage by (case-insensitive) label substring. */
function findPct(rows: CachedStaartRow[] | undefined, label: string): number | null {
  if (!rows) return null;
  const needle = label.toLowerCase();
  const row = rows.find((r) => (r?.label ?? '').toLowerCase().includes(needle));
  if (!row) return null;
  return row.percentage ?? null;
}

/**
 * Synthesize the standard set of staart_* CostItems.
 * Tries cached `schedule.staartRows` first (preserves user's percentages).
 * Falls back to standard NL bouw values if not present or label not found.
 */
export function synthesizeStaartItems(schedule: any): CostItem[] {
  const cached = (schedule?.staartRows as CachedStaartRow[] | undefined) ?? undefined;

  const akOaPct        = findPct(cached, 'algemene kosten over onderaanneming') ?? 9;
  const abkPct         = findPct(cached, 'algemene bedrijfskosten') ?? 6;
  const garantiesPct   = findPct(cached, 'garantie') ?? 2;
  const wvpmPct        = findPct(cached, 'werkvoorbereiding') ?? 2;
  const risicoPct      = findPct(cached, 'risico') ?? 3;
  const winstPct       = findPct(cached, 'winst') ?? 5;
  const verzekeringPct = findPct(cached, 'verzekering') ?? 0.5;
  const btwPct         = findPct(cached, 'btw hoog') ?? findPct(cached, 'btw') ?? 21;

  let n = 9000;
  return [
    makeStaartItem('staart_ak_oa',       'Algemene kosten over onderaanneming:', akOaPct,        n++),
    makeStaartItem('staart_abk',         'Algemene bedrijfskosten:',              abkPct,         n++),
    makeStaartItem('staart_garanties',   'Garanties:',                            garantiesPct,   n++),
    makeStaartItem('staart_wvpm',        'Werkvoorbereiding & projectmanagement', wvpmPct,        n++),
    makeStaartItem('staart_risico',      'Risico:',                               risicoPct,      n++),
    makeStaartItem('staart_winst',       'Winst:',                                winstPct,       n++),
    makeStaartItem('staart_verzekering', 'Verzekering:',                          verzekeringPct, n++),
    makeStaartItem('staart_btw',         'Btw hoog:',                             btwPct,         n++),
    makeStaartItem('staart_afronding',   'Afronding',                             null,           n++),
  ];
}
