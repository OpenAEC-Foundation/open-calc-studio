import { describe, it, expect, afterAll } from 'vitest';
import { existsSync, readFileSync, writeFileSync, mkdtempSync, mkdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { importOnlv, POSART_MARKERS } from '@/services/importers/onlvImporter';
import { buildOnlv } from '@/services/export/onlvExporter';
import { recalculateItems, getKostprijs } from '@/services/calculation/calculator';
import { deserializeProject } from '@/services/file/fileService';
import type { ImportResult } from '@/services/importers/types';
import type { CostItem, CostSchedule } from '@/types/costModel';

/**
 * Rondreis ÖNORM A 2063: uit een Leistungsbuch een Leistungsverzeichnis
 * bouwen (willekeurige-maar-deterministische hoeveelheden en prijzen) →
 * exporteren als .onlv → opnieuw importeren → regel voor regel vergelijken
 * (zoals bc3Roundtrip.test.ts). Daarnaast: de OCS-voorbeeldbegroting →
 * .onlv → import → totalen gelijk op een exact voorspelbare afronding na.
 * Elke export wordt naar een tijdelijke map geschreven en met
 * `scripts/validate-a2063.py` tegen de officiële XSD's gevalideerd; zonder
 * python of XSD-map wordt die stap overgeslagen.
 *
 * Ook de echte Leistungsbücher (SCHOKO in de repo, de BMWET-LB's ernaast)
 * worden hier gemeten (aantallen, onbekende eenheden, Lücken, tijd).
 *
 * De meetresultaten komen (in het Engels, de repo is internationaal) in
 * `verification/onorm-a2063/RAPPORT.md`; de kleine exports gaan als
 * voorbeeld van onze uitvoer naar `verification/onorm-a2063/export/`.
 */

const REPO_DIR = path.resolve(process.cwd(), 'verification', 'onorm-a2063');
const EXT_DIR = process.env.A2063_DIR ?? path.resolve(process.cwd(), '..', 'verification-files', 'Begrotingen', 'ONORM-A2063');
const XSD_DIR = path.join(EXT_DIR, 'schema_a2063_2021-03-15', 'schema_a2063_2021-03-15');
const SCRIPT = path.resolve(process.cwd(), 'scripts', 'validate-a2063.py');
const REPORT = path.join(REPO_DIR, 'RAPPORT.md');
const EXPORT_DIR = path.join(REPO_DIR, 'export');
const TOL = 0.01;

const SCHOKO = path.join(REPO_DIR, 'LB-SCHOKO_V2021.onlb');
const LB_HB = path.join(EXT_DIR, 'LB-HB-023-2021', 'LB-HB-023-2021.onlb');
const VOORBEELD = path.resolve(process.cwd(), 'public', 'data', 'voorbeeld.ifcCalc');

/** Echte Leistungsbücher die gemeten worden (voor zover aanwezig). */
const LEISTUNGSBUECHER = [
  SCHOKO,
  LB_HB,
  path.join(EXT_DIR, 'LB-HB-023-2015', 'LB-HB-023-2015.onlb'),
  path.join(EXT_DIR, 'LB-HT-014-2021', 'LB-HT-014-2021.onlb'),
  path.join(EXT_DIR, 'LB-HT-014-2015', 'LB-HT-014-2015.onlb'),
].filter((f) => existsSync(f));

// ── Schemavalidatie via python ──────────────────────────────────────────────

const pythonOk = ((): boolean => {
  try { execFileSync('python', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; }
})();
const canValidate = pythonOk && existsSync(SCRIPT) && existsSync(path.join(XSD_DIR, 'onlv.xsd'));

interface Validation { status: 'valid' | 'invalid' | 'skipped'; output: string }

function validate(file: string): Validation {
  if (!canValidate) return { status: 'skipped', output: pythonOk ? 'XSD directory not found' : 'python not found' };
  try {
    const output = execFileSync('python', [SCRIPT, file, '--xsd-dir', XSD_DIR, '--max-errors', '5'], { encoding: 'utf-8' });
    return { status: 'valid', output: output.trim() };
  } catch (err: unknown) {
    const e = err as { status?: number; stdout?: string; stderr?: string; message?: string };
    const output = `${e.stdout ?? ''}${e.stderr ?? ''}`.trim() || (e.message ?? String(err));
    if (e.status === 3) return { status: 'skipped', output };
    return { status: 'invalid', output };
  }
}

const outDir = mkdtempSync(path.join(os.tmpdir(), 'ocs-a2063-'));

// ── Hulpfuncties ────────────────────────────────────────────────────────────

const baseSchedule = (partial: Partial<CostSchedule>): CostSchedule => ({
  id: 'rt', name: '', description: '', status: 'DRAFT', predefinedType: 'BUDGET',
  currency: 'EUR', projectName: '', projectNumber: '', client: '', author: '',
  ifcGuid: 'rt', uitvoeringskosten: 0, algemeneKosten: 0, winstRisico: 0,
  ...partial,
});

/** Deterministische pseudo-toevalsgetallen (LCG), zodat de test reproduceerbaar is. */
const lcg = (seed: number) => {
  let s = seed;
  return (): number => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
};

/**
 * Van een Leistungsbuch een LV maken: elke post krijgt een hoeveelheid (2
 * decimalen, zoals lvmenge.type) en Lohn/Sonstiges-prijzen; om de tien
 * posten een Eventualposition (verrekenbaar N plus de markering in de
 * notities, precies zoals de importer die aanmaakt), die in ÖNORM niet
 * meetelt.
 */
const toLv = (items: CostItem[], seed: number): CostItem[] => {
  const rnd = lcg(seed);
  let n = 0;
  return recalculateItems(items.map((it) => {
    if (it.rowType !== 'begrotingspost') return it;
    n++;
    const eventual = n % 10 === 0;
    return {
      ...it,
      quantity: Math.round(rnd() * 100000) / 100,
      laborPrice: Math.round(rnd() * 20000) / 100,
      materialPrice: Math.round(rnd() * 50000) / 100,
      verrekenbaar: eventual ? 'N' : null,
      notes: eventual ? [POSART_MARKERS.eventual, it.notes].filter(Boolean).join('\n') : it.notes,
    };
  }));
};

interface Snapshot {
  rowType: string; code: string; description: string; unit: string;
  quantity: number; laborPrice: number; materialPrice: number; unitPrice: number; total: number;
  depth: number; parentIndex: number; notes: string; verrekenbaar: string;
}

const snapshot = (items: CostItem[]): Snapshot[] => {
  const index = new Map(items.map((it, i) => [it.id, i]));
  return items.map((it) => ({
    rowType: it.rowType, code: it.code, description: it.description, unit: it.unit,
    quantity: it.quantity ?? 0, laborPrice: it.laborPrice ?? 0, materialPrice: it.materialPrice ?? 0,
    unitPrice: it.unitPrice, total: it.total, depth: it.depth,
    parentIndex: it.parentId ? index.get(it.parentId) ?? -2 : -1,
    notes: (it.notes ?? '').trim(), verrekenbaar: it.verrekenbaar ?? '',
  }));
};

interface Diff { index: number; field: keyof Snapshot; a: string | number; b: string | number }

const compare = (a: Snapshot[], b: Snapshot[]): Diff[] => {
  const diffs: Diff[] = [];
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i];
    const y = b[i];
    const eq = (field: keyof Snapshot, ok: boolean): void => {
      if (!ok) diffs.push({ index: i, field, a: x[field], b: y[field] });
    };
    eq('rowType', x.rowType === y.rowType);
    eq('code', x.code === y.code);
    eq('description', x.description === y.description);
    eq('unit', x.unit === y.unit);
    eq('quantity', Math.abs(x.quantity - y.quantity) <= 1e-9);
    eq('laborPrice', Math.abs(x.laborPrice - y.laborPrice) <= TOL);
    eq('materialPrice', Math.abs(x.materialPrice - y.materialPrice) <= TOL);
    eq('unitPrice', Math.abs(x.unitPrice - y.unitPrice) <= TOL);
    eq('total', Math.abs(x.total - y.total) <= TOL);
    eq('depth', x.depth === y.depth);
    eq('parentIndex', x.parentIndex === y.parentIndex);
    eq('notes', x.notes === y.notes);
    eq('verrekenbaar', x.verrekenbaar === y.verrekenbaar);
  }
  return diffs;
};

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Afronding die de export onvermijdelijk meebrengt: `preis/gesamt` is in het
 * schema een betrag.type met 2 decimalen, terwijl een post met rekenregels
 * een berekende eenheidsprijs (total / quantity) met meer decimalen heeft.
 * Per post: quantity × (round2(unit) − unit); de som is het verwachte
 * verschil tussen kostprijs B en A.
 */
interface RoundingLine { code: string; description: string; quantity: number; unit: number; rounded: number; effect: number }
const expectedRounding = (items: CostItem[]): { total: number; lines: RoundingLine[] } => {
  const lines: RoundingLine[] = [];
  for (const p of items) {
    if (p.rowType !== 'begrotingspost') continue;
    const q = p.quantity ?? 0;
    const unit = q !== 0 ? p.total / q : p.unitPrice;
    const effect = q * (round2(unit) - unit);
    if (Math.abs(effect) >= 0.005) lines.push({ code: p.code, description: p.description, quantity: q, unit, rounded: round2(unit), effect });
  }
  return { total: lines.reduce((s, l) => s + l.effect, 0), lines };
};

const cell = (s: string | number): string => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 60);
const fmt = (n: number): string => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const int = (n: number): string => n.toLocaleString('en-US');

interface Row {
  name: string; source: string; itemsA: number; itemsB: number; positions: number; textRows: number;
  totalA: number; totalB: number; diffs: Diff[]; lvType: string; bytes: number;
  exportMs: number; importMs: number; warningsA: string[]; warningsB: string[]; exportWarnings: string[];
  validation: Validation; file: string;
  /** false: de structuur verandert bewust (rekenregels/staart vervallen), alleen totalen vergelijken. */
  lineByLine: boolean;
  rounding: { total: number; lines: RoundingLine[] };
  /** Kopie in verification/onorm-a2063/export/ (alleen kleine bestanden). */
  kept: boolean;
}
const rows: Row[] = [];
const controls: { name: string; validation: Validation }[] = [];

interface LbRow {
  name: string; namespace: string; bytes: number; lg: number; ulg: number; grundtextnr: number;
  folgepositionen: number; ungeteilt: number; chapters: number; positions: number; textRows: number;
  gaps: number; optional: number; unknownUnits: string[]; unitsUsed: number; importMs: number; warnings: string[];
}
const lbRows: LbRow[] = [];

/** Elementen tellen in de ruwe tekst (onafhankelijk van de importer). */
const count = (xml: string, tag: string): number => {
  const re = tag === 'lg' || tag === 'ulg' ? new RegExp(`<${tag} nr="`, 'g') : new RegExp(`<${tag}[ >/]`, 'g');
  return (xml.match(re) ?? []).length;
};

/** Rondreis van een LV: exporteren, valideren, opnieuw importeren, vergelijken. */
const roundtrip = (name: string, source: string, schedule: CostSchedule, itemsA: CostItem[], warningsA: string[], lineByLine = true): Row => {
  const t0 = performance.now();
  const { xml, warnings: exportWarnings, lvType } = buildOnlv(schedule, itemsA, { now: new Date(2026, 0, 15, 12, 0, 0), fileName: `${name}.onlv` });
  const exportMs = performance.now() - t0;
  const file = path.join(outDir, `${name}.onlv`);
  writeFileSync(file, xml, 'utf-8');
  const t1 = performance.now();
  const B: ImportResult = importOnlv(xml);
  const importMs = performance.now() - t1;
  const itemsB = recalculateItems(B.items);
  const bytes = Buffer.byteLength(xml, 'utf-8');
  let kept = false;
  if (bytes < 100_000 && existsSync(REPO_DIR)) {
    mkdirSync(EXPORT_DIR, { recursive: true });
    writeFileSync(path.join(EXPORT_DIR, `${name}.onlv`), xml, 'utf-8');
    kept = true;
  }
  const row: Row = {
    name, source, itemsA: itemsA.length, itemsB: itemsB.length,
    positions: itemsA.filter((i) => i.rowType === 'begrotingspost').length,
    textRows: itemsA.filter((i) => i.rowType === 'tekstregel').length,
    totalA: getKostprijs(itemsA), totalB: getKostprijs(itemsB),
    diffs: compare(snapshot(itemsA), snapshot(itemsB)),
    lvType, bytes, exportMs, importMs,
    warningsA, warningsB: B.warnings, exportWarnings, validation: validate(file), file, lineByLine,
    rounding: expectedRounding(itemsA), kept,
  };
  rows.push(row);
  return row;
};

const expectLossless = (row: Row): void => {
  expect(row.itemsB).toBe(row.itemsA);
  expect(row.diffs, row.diffs.slice(0, 5).map((d) => `#${d.index} ${d.field}: ${cell(d.a)} → ${cell(d.b)}`).join('; ')).toEqual([]);
  expect(Math.abs(row.totalB - row.totalA)).toBeLessThanOrEqual(TOL);
};

const expectValid = (v: Validation): void => {
  if (v.status === 'skipped') return;
  expect(v.status, v.output).toBe('valid');
};

// ── Tests ───────────────────────────────────────────────────────────────────

describe.skipIf(LEISTUNGSBUECHER.length === 0)('ÖNORM A 2063 — metingen op de echte Leistungsbücher', () => {
  for (const file of LEISTUNGSBUECHER) {
    it(`${path.basename(file)}: telt lg/ulg/posities zoals het bestand en importeert in minder dan 3 s`, () => {
      const xml = readFileSync(file, 'utf-8');
      const t0 = performance.now();
      const res = importOnlv(xml);
      const importMs = performance.now() - t0;
      const param = (code: string): Record<string, unknown> => (res.warningCodes?.find((c) => c.code === code)?.params ?? {}) as Record<string, unknown>;
      const posts = res.items.filter((i) => i.rowType === 'begrotingspost');
      const row: LbRow = {
        name: path.basename(file),
        namespace: (/xmlns="http:\/\/www\.oenorm\.at\/schema\/A2063\/([^"]+)"/.exec(xml.slice(0, 2000))?.[1]) ?? '?',
        bytes: statSync(file).size,
        lg: count(xml, 'lg'), ulg: count(xml, 'ulg'), grundtextnr: count(xml, 'grundtextnr'),
        folgepositionen: count(xml, 'folgeposition'), ungeteilt: count(xml, 'ungeteilteposition'),
        chapters: res.items.filter((i) => i.rowType === 'chapter').length,
        positions: posts.length,
        textRows: res.items.filter((i) => i.rowType === 'tekstregel').length,
        gaps: Number(param('luecken').count ?? 0),
        optional: Number(param('wahlEventual').count ?? 0),
        unknownUnits: String(param('unknownUnit').examples ?? '').split(', ').filter(Boolean),
        unitsUsed: new Set(posts.map((p) => p.unit)).size,
        importMs,
        warnings: res.warnings,
      };
      lbRows.push(row);
      expect(row.chapters).toBe(row.lg + row.ulg);
      expect(row.positions + row.textRows).toBe(row.folgepositionen + row.ungeteilt);
      expect(importMs, `import took ${importMs.toFixed(0)} ms`).toBeLessThan(3000);
    });
  }
});

describe.skipIf(!existsSync(SCHOKO))('ÖNORM A 2063 rondreis — LV uit LB-SCHOKO', () => {
  const A = importOnlv(readFileSync(SCHOKO, 'utf-8'));
  const itemsA = toLv(A.items, 7);
  const schedule = baseSchedule({ ...A.schedule, projectNumber: 'SCHOKO-LV-1', client: 'Konditorei Muster GmbH' });
  const row = roundtrip('lb-schoko-lv', 'LB-SCHOKO_V2021.onlb', schedule, itemsA, A.warnings);

  it('komt na export → import regel voor regel identiek terug (structuur, teksten, hoeveelheden, Lohn/Sonstiges, totalen)', () => {
    expect(row.lvType).toBe('kostenschaetzungs-lv');
    expect(row.positions).toBe(5);
    expectLossless(row);
  });

  it('bewaart de kenndaten', () => {
    const B = importOnlv(readFileSync(row.file, 'utf-8'));
    expect(B.schedule.projectName).toBe(schedule.projectName);
    expect(B.schedule.projectNumber).toBe('SCHOKO-LV-1');
    expect(B.schedule.client).toBe('Konditorei Muster GmbH');
    expect((B.schedule.description ?? '').trim()).toBe(schedule.description.trim());
  });

  it('is geldig tegen onlv.xsd (0 schemafouten)', () => {
    expectValid(row.validation);
  });
});

describe.skipIf(!existsSync(LB_HB))('ÖNORM A 2063 rondreis — LV uit een deel van LB-HB-023-2021', () => {
  const A = importOnlv(readFileSync(LB_HB, 'utf-8'));
  // Een deel: de eerste vier Leistungsgruppen met alles eronder (incl. de
  // wählbare Vorbemerkungen van LG 00 en de ungeteilte posities van LG 01).
  const tops = A.items.filter((i) => i.parentId === null).slice(0, 4);
  const keep = new Set(tops.map((t) => t.id));
  for (const it of A.items) if (it.parentId && keep.has(it.parentId)) keep.add(it.id);
  const itemsA = toLv(A.items.filter((i) => keep.has(i.id)), 23);
  const schedule = baseSchedule({ ...A.schedule, name: 'LV uit LB-HB (deel)', projectNumber: 'HB-LV-1', client: 'Bauherr' });
  const row = roundtrip('lb-hb-deel-lv', 'LB-HB-023-2021.onlb (LG 00–03)', schedule, itemsA, A.warnings);

  it('komt na export → import regel voor regel identiek terug', () => {
    expect(row.positions).toBeGreaterThan(100);
    expect(itemsA.filter((i) => i.rowType === 'tekstregel').length).toBeGreaterThan(0);
    expectLossless(row);
  });

  it('is geldig tegen onlv.xsd (0 schemafouten)', () => {
    expectValid(row.validation);
  });
});

describe.skipIf(!existsSync(VOORBEELD))('ÖNORM A 2063 rondreis — OCS-voorbeeldbegroting', () => {
  const project = deserializeProject(readFileSync(VOORBEELD, 'utf-8'));
  const itemsA = recalculateItems(project.items);
  const row = roundtrip('voorbeeld', 'public/data/voorbeeld.ifcCalc', project.schedule, itemsA, [], false);
  const itemsB = recalculateItems(importOnlv(readFileSync(row.file, 'utf-8')).items);

  it('schrijft een kostenschaetzungs-lv met elke post als positie', () => {
    expect(row.lvType).toBe('kostenschaetzungs-lv');
    const postsA = itemsA.filter((i) => i.rowType === 'begrotingspost');
    const postsB = itemsB.filter((i) => i.rowType === 'begrotingspost');
    expect(postsB.map((p) => p.description)).toEqual(postsA.map((p) => p.description));
    expect(postsB.map((p) => `${p.unit}:${p.quantity}`)).toEqual(postsA.map((p) => `${p.unit}:${p.quantity}`));
    expect(row.exportWarnings.some((w) => w.includes('rekenregel'))).toBe(true);
    expect(row.exportWarnings.some((w) => w.includes('staartregel'))).toBe(true);
  });

  it('wijkt in kostprijs precies de voorspelde afronding af: eenheidsprijzen staan in het schema op 2 decimalen (betrag.type)', () => {
    // Posten met rekenregels hebben een berekende eenheidsprijs (total /
    // quantity) met meer dan 2 decimalen; het schema laat er 2 toe. Het
    // verschil per post is quantity × (afgerond − exact) en is dus exact
    // te voorspellen — niet "ongeveer nul", maar precies dit bedrag.
    const postsA = itemsA.filter((i) => i.rowType === 'begrotingspost');
    const postsB = itemsB.filter((i) => i.rowType === 'begrotingspost');
    for (let i = 0; i < postsA.length; i++) {
      const q = postsA[i].quantity ?? 0;
      const unit = q !== 0 ? postsA[i].total / q : postsA[i].unitPrice;
      expect(postsB[i].total, postsA[i].description).toBeCloseTo(q * round2(unit), 2);
    }
    expect(row.rounding.lines.length).toBeGreaterThan(0);
    expect(row.rounding.total).not.toBe(0);
    expect(row.totalB - row.totalA).toBeCloseTo(row.rounding.total, 2);
    // Posten waarvan de berekende prijs al op 2 decimalen ligt komen exact terug.
    for (const p of postsA) {
      if (row.rounding.lines.some((l) => l.code === p.code)) continue;
      expect(postsB[postsA.indexOf(p)].total, p.description).toBeCloseTo(p.total, 2);
    }
  });

  it('is geldig tegen onlv.xsd (0 schemafouten)', () => {
    expectValid(row.validation);
  });
});

describe.skipIf(!canValidate)('ÖNORM A 2063 — controle van de validator zelf', () => {
  it('keurt de officiële Leistungsbücher goed', () => {
    for (const file of [SCHOKO, LB_HB]) {
      if (!existsSync(file)) continue;
      const v = validate(file);
      controls.push({ name: path.basename(file), validation: v });
      expectValid(v);
    }
  });

  it('keurt een bestand met een schemafout af', () => {
    const xml = readFileSync(SCHOKO, 'utf-8').replace('<einheit>kg</einheit>', '<einheit>zak</einheit>');
    const file = path.join(outDir, 'ongeldig.onlb');
    writeFileSync(file, xml, 'utf-8');
    const v = validate(file);
    controls.push({ name: 'LB-SCHOKO with unit "zak" (deliberately invalid, negative control)', validation: v });
    expect(v.status).toBe('invalid');
    expect(v.output).toMatch(/einheit/);
  });
});

// ── Rapport ─────────────────────────────────────────────────────────────────

afterAll(() => {
  if (rows.length === 0 || !existsSync(REPO_DIR)) return;
  const START = '<!-- generated:begin -->';
  const END = '<!-- generated:end -->';
  const generated = `${START}\n${buildReport()}${END}`;
  const existing = existsSync(REPORT) ? readFileSync(REPORT, 'utf-8') : '';
  const s = existing.indexOf(START);
  const e = existing.indexOf(END);
  const next = s >= 0 && e > s
    ? existing.slice(0, s) + generated + existing.slice(e + END.length)
    : `# ÖNORM A 2063 — verification report\n\n${generated}\n`;
  writeFileSync(REPORT, next.replace(/\r\n/g, '\n'), { encoding: 'utf-8' });
});

function buildReport(): string {
  const out: string[] = [];
  const status = (v: Validation): string => v.status === 'valid' ? 'valid (0 errors)' : v.status === 'invalid' ? 'INVALID' : `skipped (${v.output})`;
  out.push('## Measurements');
  out.push('');
  out.push('Generated by `src/test/onlvRoundtrip.test.ts` (`npx vitest run src/test/onlvRoundtrip.test.ts`).');
  out.push('Round trip: build a priced LV (A) → export as .onlv (namespace 2021-03-01) → schema validation with `scripts/validate-a2063.py` against the official XSDs → import again (B) → compare A and B row by row.');
  out.push('Tolerance for amounts: 0.01. "Items" counts chapters, positions and text rows after `recalculateItems`.');
  out.push('Warnings are quoted as the importer and exporter emit them (in Dutch; the application translates them by code into the language of the user).');
  out.push('');

  if (lbRows.length > 0) {
    out.push('### Import of the real Leistungsbücher');
    out.push('');
    out.push('Counts of lg/ulg/grundtextnr/positions are taken from the raw XML (independent of the importer); "Chapters" and "Positions" are what the importer produced. Every lg and ulg must become a chapter, every folgeposition and ungeteilteposition a position or (without a unit) a text row.');
    out.push('');
    out.push('| File | Namespace | Size | lg | ulg | grundtextnr | folgepositionen | ungeteilte | Chapters | Positions | Text rows | Positions with gaps | Wahl/Eventual | Units used | Units without equivalent | Import |');
    out.push('| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |');
    for (const r of lbRows) {
      out.push(`| \`${r.name}\` | ${r.namespace} | ${(r.bytes / 1024 / 1024).toFixed(1)} MB | ${int(r.lg)} | ${int(r.ulg)} | ${int(r.grundtextnr)} | ${int(r.folgepositionen)} | ${int(r.ungeteilt)} | ${int(r.chapters)} | ${int(r.positions)} | ${int(r.textRows)} | ${int(r.gaps)} | ${int(r.optional)} | ${r.unitsUsed} | ${r.unknownUnits.length > 0 ? r.unknownUnits.join(', ') : 'none'} | ${r.importMs.toFixed(0)} ms |`);
    }
    out.push('');
  }

  out.push('### Round trip');
  out.push('');
  out.push('| LV | Source | LV type | Items A | Items B | Positions | Text rows | Direct cost A | Direct cost B | Difference | Rows differing | Export (bytes) | Export | Import | Schema |');
  out.push('| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |');
  for (const r of rows) {
    const diffRows = r.lineByLine ? String(new Set(r.diffs.map((d) => d.index)).size) : 'totals only (see below)';
    const diff = r.totalB - r.totalA;
    const diffCell = Math.abs(diff) < 0.005 ? '0.00' : `${fmt(diff)} (explained rounding, ${r.rounding.lines.length} positions)`;
    out.push(`| \`${r.name}.onlv\` | ${cell(r.source)} | ${r.lvType} | ${r.itemsA} | ${r.itemsB} | ${r.positions} | ${r.textRows} | ${fmt(r.totalA)} | ${fmt(r.totalB)} | ${diffCell} | ${diffRows} | ${int(r.bytes)} | ${r.exportMs.toFixed(0)} ms | ${r.importMs.toFixed(0)} ms | ${status(r.validation)} |`);
  }
  out.push('');
  for (const r of rows) {
    out.push(`#### ${r.name}.onlv`);
    out.push('');
    out.push(`- Direct cost A: ${fmt(r.totalA)}; B: ${fmt(r.totalB)}; difference: ${fmt(r.totalB - r.totalA)}`);
    if (!r.lineByLine) {
      out.push('- Row-by-row comparison: not applicable by design — resource rows (rekenregels) are folded into the position price, overhead rows (staart) are dropped and a ulg level is added; positions (description, unit, quantity, total) and the direct cost are compared instead.');
    } else if (r.diffs.length > 0) {
      const byField: Record<string, number> = {};
      for (const d of r.diffs) byField[d.field] = (byField[d.field] ?? 0) + 1;
      out.push(`- Differences: ${new Set(r.diffs.map((d) => d.index)).size} row(s), per field: ${Object.entries(byField).map(([k, v]) => `${k} ${v}`).join(', ')}`);
      for (const d of r.diffs.slice(0, 3)) out.push(`  - item #${d.index} ${d.field}: \`${cell(d.a)}\` → \`${cell(d.b)}\``);
    } else {
      out.push('- Differences: none');
    }
    if (r.rounding.lines.length > 0) {
      out.push(`- Explained rounding: the schema type \`betrag.type\` allows 2 decimals for \`preis/gesamt\`; these positions have a computed unit price (total ÷ quantity) with more decimals. Sum of quantity × (rounded − exact) = ${fmt(r.rounding.total)}, which the test asserts exactly.`);
      out.push('');
      out.push('  | Position | Quantity | Exact unit price | Written | Effect on total |');
      out.push('  | --- | ---: | ---: | ---: | ---: |');
      for (const l of r.rounding.lines) out.push(`  | \`${l.code}\` ${cell(l.description)} | ${fmt(l.quantity)} | ${l.unit.toFixed(6)} | ${fmt(l.rounded)} | ${fmt(l.effect)} |`);
      out.push('');
    }
    out.push(`- Export warnings: ${r.exportWarnings.length > 0 ? r.exportWarnings.map((w) => cell(w).slice(0, 80)).join(' / ') : 'none'}`);
    out.push(`- Import warnings on B: ${r.warningsB.length > 0 ? r.warningsB.map((w) => cell(w).slice(0, 80)).join(' / ') : 'none'}`);
    out.push(`- Schema validation: ${status(r.validation)}`);
    if (r.kept) out.push(`- Output kept as example: \`verification/onorm-a2063/export/${r.name}.onlv\``);
    out.push('');
  }
  if (controls.length > 0) {
    out.push('### Check of the validator itself');
    out.push('');
    out.push('The validator must accept the official files and reject a file with a deliberate schema error, otherwise "valid" above would mean nothing.');
    out.push('');
    for (const c of controls) out.push(`- ${c.name}: ${status(c.validation)}`);
    out.push('');
  }
  return out.join('\n') + '\n';
}
