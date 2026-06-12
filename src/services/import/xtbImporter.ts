/**
 * IBIS-TRAD .xtb (SQLite) importer.
 *
 * .xtb is an SQLite 3 database with these key tables:
 *   - Begrotingen        : project metadata (Naam, Datum, NettoTotaal, totals)
 *   - BegrotingsRegels   : tree structure (Id, ParentId, Type, CalculatieCode, Omschrijving, Regelnummer)
 *                          Type: 0 = chapter/header, 2 = leaf cost line
 *   - Kostenposten       : cost data per leaf (Id matches BegrotingsRegels.Id)
 *                          (Hoeveelheid, Eenheidsprijs, NettoArbeid/Materiaal/Materieel/Onderaanneming)
 *   - Middelen           : resource library (MiddelCode, Omschrijving, Eenheid, EenheidsprijsX)
 *   - Elementen          : element rows (rolled up totals)
 *   - UurloonBedragen    : hourly rates per UurloonCode
 *   - BegrotingBladen    : sheet metadata (rarely needed for cost-grid import)
 */
import type {
  CostItem,
  CostSchedule,
  RowType,
  ResourceType,
  CostUnit,
} from '@/types/costModel';
import { createDefaultSchedule } from '@/data/defaultBudget';

interface XtbBegroting {
  Naam: string;
  Datum: string;
  Omschrijving: string | null;
  NettoTotaal: number;
  BrutoTotaal: number;
  TotaalUren: number;
}

interface XtbRegel {
  Id: number;
  ParentId: number | null;
  Regelnummer: number;
  Type: number;
  CalculatieCode: string;
  Omschrijving: string;
  Multipliciteit: number;
}

interface XtbKostenpost {
  Id: number;
  MiddelId: number | null;
  Hoeveelheid: number;
  Eenheidsprijs: number;
  NettoArbeid: number;
  NettoMateriaal: number;
  NettoMaterieel: number;
  NettoOnderaanneming: number;
  NettoTotaal: number;
  ProductieFactor: number;
  Uren: number;
}

interface XtbMiddel {
  MiddelId: number;
  MiddelCode: string;
  Omschrijving: string;
  Eenheid: string;
  NormUren: number;
  UurNormType: number;
  EenheidsprijsMateriaal: number;
  EenheidsprijsMaterieel: number;
  EenheidsprijsOnderaanneming: number;
}

interface XtbElement {
  Id: number;
  Eenheid: string;
  Hoeveelheid: number;
  NettoTotaal: number;
}

export interface XtbImportResult {
  schedule: CostSchedule;
  items: CostItem[];
  warnings: string[];
}

function genId(): string {
  return crypto.randomUUID();
}

function genIfcGuid(): string {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';
  let r = '';
  for (let i = 0; i < 22; i++) r += chars[Math.floor(Math.random() * 64)];
  return r;
}

function normalizeUnit(u: string): CostUnit {
  const t = u.trim().toLowerCase();
  const map: Record<string, CostUnit> = {
    'm': 'm', 'm1': 'm', 'meter': 'm',
    'm2': 'm²', 'm²': 'm²', 'sqm': 'm²',
    'm3': 'm³', 'm³': 'm³', 'cbm': 'm³',
    'kg': 'kg', 'ton': 'ton',
    'uur': 'uur', 'u': 'uur', 'hour': 'uur',
    'dgn': 'dgn', 'dag': 'dgn', 'dagen': 'dgn',
    'wk': 'week', 'week': 'week', 'weken': 'week',
    'mnd': 'mnd', 'maand': 'mnd',
    'km': 'km',
    'keer': 'keer', 'x': 'keer',
    'ls': 'ls', 'pst': 'ls', 'post': 'post',
    '%': '%', 'pm': 'pm',
    'st': 'st', 'stk': 'st', 'stuks': 'st', 'stuk': 'st',
  };
  return map[t] ?? 'st';
}

function makeItem(partial: Partial<CostItem>): CostItem {
  return {
    id: genId(),
    parentId: null,
    sortOrder: 0,
    code: '',
    description: '',
    unit: 'st' as CostUnit,
    quantity: null,
    materialPrice: null,
    laborPrice: null,
    unitPrice: 0,
    total: 0,
    isCollapsed: false,
    depth: 0,
    notes: '',
    ifcGuid: genIfcGuid(),
    rowType: 'begrotingspost' as RowType,
    staartPercentage: null,
    nr: '',
    normQuantity: null,
    normFactor: null,
    normDivisor: null,
    normUnitPrice: null,
    resourceType: null,
    resourceLibraryId: null,
    verrekenbaar: null,
    tariefGroep: null,
    ...partial,
  };
}

/** Minimal sql.js Database surface used by the importer (keeps it testable). */
interface SqlJsDatabase {
  exec(sql: string): Array<{ columns: string[]; values: unknown[][] }>;
  close(): void;
}

/**
 * Import an IBIS-TRAD .xtb file (SQLite3) into OCS structures.
 *
 * Tree mapping:
 *   - A synthetic root (Type=0, empty CalculatieCode + Omschrijving, ParentId=NULL)
 *     is skipped; its direct children become the top-level chapters.
 *   - BegrotingsRegels.Type==0 → 'chapter' (nestable sub-chapters)
 *   - BegrotingsRegels.Type==2 with associated Kostenpost → a single
 *     'begrotingspost' (NO separate regel child, to avoid double counting).
 */
export async function importXtbFile(buffer: ArrayBuffer): Promise<XtbImportResult> {
  // sql.js is lazy-loaded; the wasm URL is bundled by Vite so it works in
  // dev (vite-server) and in Tauri release (asset:// protocol) identically.
  const initSqlJs = (await import('sql.js')).default;
  // @ts-expect-error - ?url import returns a string URL at build time
  const wasmUrl = (await import('sql.js/dist/sql-wasm.wasm?url')).default;
  const SQL = await initSqlJs({
    locateFile: () => wasmUrl,
  });
  const db = new SQL.Database(new Uint8Array(buffer)) as unknown as SqlJsDatabase;
  return buildXtbImport(db);
}

/**
 * Pure mapping from an opened sql.js database to OCS structures.
 * Split out so it can be unit-tested with a Node-loaded sql.js instance
 * (the wasm URL import above is Vite-only).
 */
export function buildXtbImport(db: SqlJsDatabase): XtbImportResult {
  const warnings: string[] = [];

  // ── Read Begroting metadata ──
  const begrotingRows = db.exec(
    'SELECT Naam, Datum, Omschrijving, NettoTotaal, BrutoTotaal, TotaalUren FROM Begrotingen LIMIT 1'
  );
  if (begrotingRows.length === 0 || begrotingRows[0].values.length === 0) {
    throw new Error('Geen Begroting-record gevonden in .xtb bestand');
  }
  const bgRow = begrotingRows[0].values[0];
  const begroting: XtbBegroting = {
    Naam: String(bgRow[0] ?? ''),
    Datum: String(bgRow[1] ?? ''),
    Omschrijving: bgRow[2] != null ? String(bgRow[2]) : null,
    NettoTotaal: Number(bgRow[3] ?? 0),
    BrutoTotaal: Number(bgRow[4] ?? 0),
    TotaalUren: Number(bgRow[5] ?? 0),
  };

  // ── Read all regels (the tree) ──
  const regelRows = db.exec(
    'SELECT Id, ParentId, Regelnummer, Type, CalculatieCode, Omschrijving, Multipliciteit FROM BegrotingsRegels ORDER BY Regelnummer'
  );
  const regels: XtbRegel[] = (regelRows[0]?.values ?? []).map((r) => ({
    Id: Number(r[0]),
    ParentId: r[1] != null ? Number(r[1]) : null,
    Regelnummer: Number(r[2] ?? 0),
    Type: Number(r[3] ?? 0),
    CalculatieCode: String(r[4] ?? ''),
    Omschrijving: String(r[5] ?? ''),
    Multipliciteit: Number(r[6] ?? 1),
  }));

  // ── Read Kostenposten (keyed by Id) ──
  const kpRows = db.exec(
    'SELECT Id, MiddelId, Hoeveelheid, Eenheidsprijs, NettoArbeid, NettoMateriaal, NettoMaterieel, NettoOnderaanneming, NettoTotaal, ProductieFactor, Uren FROM Kostenposten'
  );
  const kostenposten = new Map<number, XtbKostenpost>();
  for (const r of kpRows[0]?.values ?? []) {
    kostenposten.set(Number(r[0]), {
      Id: Number(r[0]),
      MiddelId: r[1] != null ? Number(r[1]) : null,
      Hoeveelheid: Number(r[2] ?? 0),
      Eenheidsprijs: Number(r[3] ?? 0),
      NettoArbeid: Number(r[4] ?? 0),
      NettoMateriaal: Number(r[5] ?? 0),
      NettoMaterieel: Number(r[6] ?? 0),
      NettoOnderaanneming: Number(r[7] ?? 0),
      NettoTotaal: Number(r[8] ?? 0),
      ProductieFactor: Number(r[9] ?? 1),
      Uren: Number(r[10] ?? 0),
    });
  }

  // ── Read Middelen (resources) ──
  const mRows = db.exec(
    'SELECT MiddelId, MiddelCode, Omschrijving, Eenheid, NormUren, UurNormType, EenheidsprijsMateriaal, EenheidsprijsMaterieel, EenheidsprijsOnderaanneming FROM Middelen'
  );
  const middelen = new Map<number, XtbMiddel>();
  for (const r of mRows[0]?.values ?? []) {
    middelen.set(Number(r[0]), {
      MiddelId: Number(r[0]),
      MiddelCode: String(r[1] ?? ''),
      Omschrijving: String(r[2] ?? ''),
      Eenheid: String(r[3] ?? ''),
      NormUren: Number(r[4] ?? 0),
      UurNormType: Number(r[5] ?? 0),
      EenheidsprijsMateriaal: Number(r[6] ?? 0),
      EenheidsprijsMaterieel: Number(r[7] ?? 0),
      EenheidsprijsOnderaanneming: Number(r[8] ?? 0),
    });
  }

  // ── Read Elementen (rolled-up totals on group rows) ──
  const eRows = db.exec(
    'SELECT Id, Eenheid, Hoeveelheid, NettoTotaal FROM Elementen'
  );
  const elementen = new Map<number, XtbElement>();
  for (const r of eRows[0]?.values ?? []) {
    elementen.set(Number(r[0]), {
      Id: Number(r[0]),
      Eenheid: String(r[1] ?? ''),
      Hoeveelheid: Number(r[2] ?? 0),
      NettoTotaal: Number(r[3] ?? 0),
    });
  }

  db.close();

  // ── Build CostItem tree ──
  // BegrotingsRegels.ParentId points to another BegrotingsRegels.Id.
  // Root has ParentId=NULL; that's a synthetic root we don't map.
  const items: CostItem[] = [];
  const idToOcsId = new Map<number, string>();
  // Track depth via parent chain
  const idToDepth = new Map<number, number>();
  // Build child map
  const childrenOf = new Map<number | 'root', XtbRegel[]>();
  for (const r of regels) {
    const key: number | 'root' = r.ParentId == null ? 'root' : r.ParentId;
    const list = childrenOf.get(key) ?? [];
    list.push(r);
    childrenOf.set(key, list);
  }

  // Detect resource type from the dominant Netto-column of the Kostenpost.
  // Falls back to 'overig' when no column dominates (e.g. an empty/text leaf).
  function resourceTypeFor(kp: XtbKostenpost | undefined): ResourceType | null {
    if (!kp) return null;
    const cols: Array<[ResourceType, number]> = [
      ['arbeid', kp.NettoArbeid],
      ['materiaal', kp.NettoMateriaal],
      ['materieel', kp.NettoMaterieel],
      ['onderaannemer', kp.NettoOnderaanneming],
    ];
    let best: ResourceType | null = null;
    let bestVal = 0;
    for (const [t, v] of cols) {
      if (v > bestVal) {
        bestVal = v;
        best = t;
      }
    }
    return best ?? 'overig';
  }

  // Walk the tree from root, skipping root itself; first level becomes chapters
  function walk(parentXtbId: number | 'root', ocsParentId: string | null, depth: number, sortStart: { v: number }): void {
    const kids = childrenOf.get(parentXtbId) ?? [];
    // Sort by Regelnummer to preserve original ordering
    kids.sort((a, b) => a.Regelnummer - b.Regelnummer);

    for (const r of kids) {
      idToDepth.set(r.Id, depth);
      const isChapter = r.Type === 0; // group / chapter / sub-chapter
      const isLeaf = r.Type === 2;    // leaf cost line

      if (isChapter) {
        const id = genId();
        idToOcsId.set(r.Id, id);
        items.push(makeItem({
          id,
          parentId: ocsParentId,
          sortOrder: sortStart.v++,
          code: r.CalculatieCode || '',
          description: r.Omschrijving || '(geen omschrijving)',
          rowType: 'chapter',
          depth,
          unit: 'st',
          quantity: r.Multipliciteit,
        }));
        // Recurse for children
        walk(r.Id, id, depth + 1, sortStart);
      } else if (isLeaf) {
        const kp = kostenposten.get(r.Id);
        const middel = kp?.MiddelId != null ? middelen.get(kp.MiddelId) : undefined;
        const element = elementen.get(r.Id);
        const eh = middel?.Eenheid || element?.Eenheid || '';
        const netto = kp?.NettoTotaal ?? element?.NettoTotaal ?? 0;
        const rType = resourceTypeFor(kp);

        // IBIS invariant: Hoeveelheid × Eenheidsprijs === NettoTotaal.
        let qty = kp?.Hoeveelheid ?? element?.Hoeveelheid ?? 0;
        let ehprijs = kp?.Eenheidsprijs ?? 0;
        // Fixed/lump-sum post: no quantity but a real amount → treat as 1 × NettoTotaal.
        if ((qty === 0 || qty == null) && netto !== 0) {
          qty = 1;
          ehprijs = netto;
        }

        // Each Type=2 leaf becomes a SINGLE begrotingspost with NO regel child.
        // The eenheidsprijs is stored in materialPrice so that the calculator's
        // childless-begrotingspost path (unitPrice = materialPrice + laborPrice,
        // total = quantity × unitPrice) reconstructs total === NettoTotaal exactly.
        const postId = genId();
        idToOcsId.set(r.Id, postId);
        items.push(makeItem({
          id: postId,
          parentId: ocsParentId,
          sortOrder: sortStart.v++,
          code: r.CalculatieCode || middel?.MiddelCode || '',
          description: r.Omschrijving || middel?.Omschrijving || '',
          rowType: 'begrotingspost',
          depth,
          unit: normalizeUnit(eh),
          quantity: qty,
          materialPrice: ehprijs,
          unitPrice: ehprijs,
          total: netto,
          resourceType: rType,
        }));
      }
    }
  }

  // ── Detect the synthetic root ──
  // IBIS-TRAD wraps the real chapters under one synthetic root node:
  //   Id=1, ParentId=NULL, Type=0, empty CalculatieCode + Omschrijving.
  // We skip it and promote its children to top-level chapters (depth 0).
  // Guard: only when there is EXACTLY one ParentId=NULL row AND it is empty,
  // otherwise fall back to the previous behaviour (walk from 'root').
  const nullRoots = regels.filter((r) => r.ParentId == null);
  const sortStart = { v: 0 };
  let startKey: number | 'root' = 'root';
  if (nullRoots.length === 1) {
    const root = nullRoots[0];
    const isSyntheticRoot =
      root.Type === 0 &&
      (root.CalculatieCode ?? '').trim() === '' &&
      (root.Omschrijving ?? '').trim() === '';
    if (isSyntheticRoot) {
      idToOcsId.set(root.Id, ''); // mark as consumed (no OCS item)
      startKey = root.Id;
    }
  }
  walk(startKey, null, 0, sortStart);

  if (items.length === 0) {
    warnings.push('Geen items gevonden. Mogelijk is dit een leeg .xtb bestand.');
  }

  // ── Build schedule ──
  const baseSchedule = createDefaultSchedule();
  const schedule: CostSchedule = {
    ...baseSchedule,
    name: begroting.Naam || 'IBIS-TRAD import',
    description: begroting.Omschrijving ?? '',
    projectName: begroting.Naam || '',
  };

  return { schedule, items, warnings };
}
