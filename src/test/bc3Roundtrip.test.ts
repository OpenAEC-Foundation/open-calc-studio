import { describe, it, expect, afterAll } from 'vitest';
import { existsSync, readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { importBc3File, decodeBc3 } from '@/services/importers/bc3Importer';
import { buildBc3, buildBc3Bytes } from '@/services/export/bc3Exporter';
import { recalculateItems, getKostprijs } from '@/services/calculation/calculator';
import type { ImportResult, ImportWarningCode } from '@/services/importers/types';
import type { CostItem, CostSchedule } from '@/types/costModel';

/**
 * Rondreis over echte FIEBDC-3-bestanden: importeren (A) → exporteren →
 * opnieuw importeren (B) → A en B regel voor regel vergelijken. De bestanden
 * staan in `verification/bc3/` (zie de README daar voor de herkomst); als de
 * map ontbreekt wordt de hele suite overgeslagen. Het overzicht komt in
 * `verification/bc3/RAPPORT.md` (Engels: de repo is internationaal en het
 * rapport is vanaf de website gelinkt).
 *
 * Naast A-tegenover-B meet de test ook A tegenover het bestand zelf: de
 * prijzen op de ~C-records van hoofdstukken en partida's tegenover onze
 * bottom-up berekening. Dat maakt zichtbaar waar een bronbestand intern
 * inconsistent is of waar het bronprogramma anders afrondt.
 */

// vitest draait vanuit de projectwortel (jsdom kent geen file-URL's).
const DIR = path.resolve(process.cwd(), 'verification', 'bc3');
const REPORT = path.join(DIR, 'RAPPORT.md');
const EN_DIALOGS = path.resolve(process.cwd(), 'src', 'i18n', 'locales', 'en', 'dialogs.json');
const TOL = 0.01;

const files = existsSync(DIR)
  ? readdirSync(DIR).filter((f) => f.toLowerCase().endsWith('.bc3')).sort((a, b) => a.localeCompare(b))
  : [];

// ── Hulpfuncties ────────────────────────────────────────────────────────────

const toArrayBuffer = (buf: Buffer): ArrayBuffer =>
  buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;

const baseSchedule = (partial: Partial<CostSchedule>): CostSchedule => ({
  id: 'rt', name: '', description: '', status: 'DRAFT', predefinedType: 'BUDGET',
  currency: 'EUR', projectName: '', projectNumber: '', client: '', author: '',
  ifcGuid: 'rt', uitvoeringskosten: 0, algemeneKosten: 0, winstRisico: 0,
  ...partial,
});

const lf = (s: string): string => s.replace(/\r\n?/g, '\n').trim();

/** Recordtypen tellen in een BC3-tekst (~C, ~D, …). */
const recordCounts = (text: string): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const m of text.matchAll(/~([A-Z])\|/g)) counts[m[1]] = (counts[m[1]] ?? 0) + 1;
  return counts;
};

/** ~V-record: schrijver, formaatversie, programma, tekenset. */
const headerInfo = (text: string): { owner: string; version: string; program: string; charset: string } => {
  const v = /~V\|([^~]*)/.exec(text);
  const f = v ? v[1].split('|').map((s) => s.trim()) : [];
  return {
    owner: f[0] ?? '',
    version: (f[1] ?? '').split('\\')[0],
    program: (f[2] ?? '').split('\\')[0],
    charset: f[4] ?? '',
  };
};

const keyOf = (code: string): string => code.trim().replace(/#+$/, '').trim().toUpperCase();

/** Eerste prijs per ~C-code (zonder #, hoofdletterongevoelig), in declaratievolgorde per code. */
const conceptPrices = (text: string): Map<string, number[]> => {
  const prices = new Map<string, number[]>();
  for (const chunk of text.split('~')) {
    if (chunk.charAt(0) !== 'C' || chunk.charAt(1) !== '|') continue;
    const f = chunk.slice(2).split('|');
    const key = keyOf((f[0] ?? '').split('\\')[0]);
    if (!key) continue;
    const price = parseFloat(((f[3] ?? '').split('\\')[0] ?? '').trim());
    const list = prices.get(key) ?? [];
    list.push(Number.isFinite(price) ? price : 0);
    prices.set(key, list);
  }
  return prices;
};

/** Prijs op het wortelconcept (##) van het originele bestand, of null. */
const rootPriceOf = (text: string): number | null => {
  for (const m of text.matchAll(/~C\|([^|]*)\|[^|]*\|[^|]*\|([^|]*)\|/g)) {
    const code = m[1].split('\\')[0].trim();
    if (/##\s*$/.test(code)) {
      const price = parseFloat((m[2].split('\\')[0] ?? '').trim());
      return Number.isFinite(price) ? price : null;
    }
  }
  return null;
};

/**
 * Importmeldingen in het Engels, uit de vertaalbestanden van de app
 * (`dialogs:importWarnings.bc3.<code>`); de Nederlandse tekst is de terugval.
 */
const englishWarnings = (() => {
  let table: Record<string, string> = {};
  try {
    const json = JSON.parse(readFileSync(EN_DIALOGS, 'utf-8')) as { importWarnings?: { bc3?: Record<string, string> } };
    table = json.importWarnings?.bc3 ?? {};
  } catch { /* geen vertaling beschikbaar */ }
  return (warnings: string[], codes: ImportWarningCode[] | undefined): string[] =>
    warnings.map((w, i) => {
      const c = codes?.[i];
      if (!c) return w;
      const count = typeof c.params?.count === 'number' ? c.params.count : undefined;
      const template = (count === 1 ? table[`${c.code}_one`] : table[`${c.code}_other`]) ?? table[c.code];
      if (!template) return w;
      return template.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(c.params?.[k] ?? ''));
    });
})();

interface Snapshot {
  rowType: string; code: string; description: string; unit: string;
  quantity: number; unitPrice: number; total: number; depth: number;
  parentIndex: number; notes: string; resourceType: string;
}

const snapshot = (items: CostItem[]): Snapshot[] => {
  const index = new Map(items.map((it, i) => [it.id, i]));
  return items.map((it) => ({
    rowType: it.rowType,
    code: it.code,
    description: it.description,
    unit: it.unit,
    quantity: it.quantity ?? 0,
    unitPrice: it.unitPrice,
    total: it.total,
    depth: it.depth,
    parentIndex: it.parentId ? index.get(it.parentId) ?? -2 : -1,
    notes: lf(it.notes ?? ''),
    resourceType: it.resourceType ?? '',
  }));
};

interface Diff { index: number; field: keyof Snapshot; a: string | number; b: string | number; }

/** Verschillen tussen A en B per item; codes mogen alleen een `_n`-suffix krijgen. */
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
    eq('quantity', Math.abs(x.quantity - y.quantity) <= 1e-6);
    eq('unitPrice', Math.abs(x.unitPrice - y.unitPrice) <= TOL);
    eq('total', Math.abs(x.total - y.total) <= TOL);
    eq('depth', x.depth === y.depth);
    eq('parentIndex', x.parentIndex === y.parentIndex);
    eq('notes', x.notes === y.notes);
    eq('resourceType', x.resourceType === y.resourceType);
  }
  return diffs;
};

/**
 * A tegenover het bestand: per hoofdstuk het totaal tegenover de ~C-prijs
 * (alleen waar het bestand een prijs ≠ 0 geeft), per partida de eenheidsprijs
 * tegenover de ~C-prijs. Dubbel gebruikte codes worden in volgorde uitgedeeld,
 * zoals de importer dat doet.
 */
interface FileCheck {
  chaptersPriced: number; chaptersOff: number; chapterMaxOff: number; chapterMaxOffCode: string;
  postsPriced: number; postsOff: number; postsNet: number; postsMaxOff: number; postsMaxOffCode: string;
}
const checkAgainstFile = (items: CostItem[], prices: Map<string, number[]>): FileCheck => {
  const seen = new Map<string, number>();
  const priceFor = (code: string): number | undefined => {
    const key = keyOf(code);
    const list = prices.get(key);
    if (!list || list.length === 0) return undefined;
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    return list[Math.min(n, list.length - 1)];
  };
  const r: FileCheck = {
    chaptersPriced: 0, chaptersOff: 0, chapterMaxOff: 0, chapterMaxOffCode: '',
    postsPriced: 0, postsOff: 0, postsNet: 0, postsMaxOff: 0, postsMaxOffCode: '',
  };
  for (const it of items) {
    if (it.rowType !== 'chapter' && it.rowType !== 'begrotingspost') continue;
    const p = priceFor(it.code);
    if (p == null || Math.abs(p) < 0.005) continue;
    if (it.rowType === 'chapter') {
      r.chaptersPriced++;
      const d = it.total - p;
      if (Math.abs(d) > TOL) r.chaptersOff++;
      if (Math.abs(d) > Math.abs(r.chapterMaxOff)) { r.chapterMaxOff = d; r.chapterMaxOffCode = it.code; }
    } else {
      r.postsPriced++;
      const d = it.unitPrice - p;
      if (Math.abs(d) > 0.005) r.postsOff++;
      // Ook verschillen onder 0,005 tellen mee: een prijs per kg die 0,002
      // afwijkt telt bij 124.000 kg voor honderden euro's.
      r.postsNet += d * (it.quantity ?? 0);
      if (Math.abs(d) > Math.abs(r.postsMaxOff)) { r.postsMaxOff = d; r.postsMaxOffCode = it.code; }
    }
  }
  return r;
};

const fmt = (n: number): string => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n: number): string => `${(n * 100).toFixed(2)} %`;
const cell = (s: string | number): string => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 60);

interface Row {
  file: string; size: number; lines: number; header: ReturnType<typeof headerInfo>;
  itemsA: number; itemsB: number; totalA: number; totalB: number;
  rootPrice: number | null; diffs: Diff[]; diffRows: number; warningsA: string[]; warningsB: string[];
  /** Waarom de wortelprijs niet met onze kostprijs te vergelijken is, of null. */
  fragment: string | null;
  countsIn: Record<string, number>; countsOut: Record<string, number>;
  notesA: number; notesB: number; multilineA: number; multilineB: number;
  chapterDiffs: number; typeCounts: Record<string, number>;
  charset: string;
  check: FileCheck;
}
const rows: Row[] = [];

const roundtrip = (file: string): Row => {
  const buf = readFileSync(path.join(DIR, file));
  const original = decodeBc3(toArrayBuffer(buf));
  const A: ImportResult = importBc3File(toArrayBuffer(buf));
  const itemsA = recalculateItems(A.items);
  const schedule = baseSchedule(A.schedule);
  const { bytes, charset } = buildBc3Bytes(schedule, itemsA);
  const text = buildBc3(schedule, itemsA, charset);
  const B: ImportResult = importBc3File(toArrayBuffer(Buffer.from(bytes)));
  const itemsB = recalculateItems(B.items);

  const snapA = snapshot(itemsA);
  const snapB = snapshot(itemsB);
  const diffs = compare(snapA, snapB);
  const chapterDiffs = itemsA.filter((it) => it.rowType === 'chapter').filter((it, i) => {
    const chaptersB = itemsB.filter((x) => x.rowType === 'chapter');
    return !chaptersB[i] || Math.abs(chaptersB[i].total - it.total) > TOL;
  }).length;
  const typeCounts: Record<string, number> = {};
  for (const it of itemsA) typeCounts[it.rowType] = (typeCounts[it.rowType] ?? 0) + 1;

  return {
    file,
    size: statSync(path.join(DIR, file)).size,
    lines: original.split(/\r?\n/).length,
    header: headerInfo(original),
    itemsA: itemsA.length,
    itemsB: itemsB.length,
    totalA: getKostprijs(itemsA),
    totalB: getKostprijs(itemsB),
    rootPrice: rootPriceOf(original),
    diffs,
    diffRows: new Set(diffs.map((d) => d.index)).size,
    warningsA: englishWarnings(A.warnings, A.warningCodes),
    warningsB: englishWarnings(B.warnings, B.warningCodes),
    fragment: (() => {
      const codes = A.warningCodes ?? [];
      const missing = codes.filter((c) => c.code === 'unknownConceptUnder' || c.code === 'unknownConceptInDecomposition').length;
      if (missing > 0) return `fragment: ${missing} referenced concepts missing`;
      if (codes.some((c) => c.code === 'noRootStructure')) return 'fragment: root has no breakdown';
      return null;
    })(),
    countsIn: recordCounts(original),
    countsOut: recordCounts(text),
    notesA: itemsA.filter((it) => it.notes).length,
    notesB: itemsB.filter((it) => it.notes).length,
    multilineA: itemsA.filter((it) => /\n/.test(it.notes)).length,
    multilineB: itemsB.filter((it) => /\n/.test(it.notes)).length,
    chapterDiffs,
    typeCounts,
    charset,
    check: checkAgainstFile(itemsA, conceptPrices(original)),
  };
};

// ── Tests ───────────────────────────────────────────────────────────────────

describe.skipIf(files.length === 0)('FIEBDC-3 rondreis over verification/bc3', () => {
  for (const file of files) {
    describe(file, () => {
      const row = roundtrip(file);
      rows.push(row);

      it('levert na de rondreis evenveel items, in dezelfde volgorde en hiërarchie', () => {
        expect(row.itemsB).toBe(row.itemsA);
        const structural = row.diffs.filter((d) => ['rowType', 'depth', 'parentIndex'].includes(d.field));
        expect(structural, structural.slice(0, 3).map((d) => `#${d.index} ${d.field}: ${cell(d.a)} → ${cell(d.b)}`).join('; ')).toEqual([]);
      });

      it('behoudt omschrijvingen, eenheden, hoeveelheden en teksten', () => {
        const textual = row.diffs.filter((d) => ['description', 'unit', 'quantity', 'notes', 'resourceType'].includes(d.field));
        expect(textual, textual.slice(0, 3).map((d) => `#${d.index} ${d.field}: ${cell(d.a)} → ${cell(d.b)}`).join('; ')).toEqual([]);
        expect(row.notesB).toBe(row.notesA);
        expect(row.multilineB).toBe(row.multilineA);
      });

      it('behoudt codes (hooguit een _n-suffix bij dubbel gebruikte codes)', () => {
        const codes = row.diffs.filter((d) => d.field === 'code');
        for (const d of codes) {
          expect(String(d.b), `#${d.index}`).toMatch(new RegExp(`^${String(d.a).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[#\s]+/g, '')}(_\\d+)?$`, 'i'));
        }
      });

      it('behoudt bedragen per regel, hoofdstuktotalen en kostprijs (± 0,01)', () => {
        const money = row.diffs.filter((d) => d.field === 'total' || d.field === 'unitPrice');
        expect(money, money.slice(0, 3).map((d) => `#${d.index} ${d.field}: ${d.a} → ${d.b}`).join('; ')).toEqual([]);
        expect(row.chapterDiffs).toBe(0);
        expect(Math.abs(row.totalB - row.totalA)).toBeLessThanOrEqual(TOL);
      });

      it('behoudt projectnaam en -omschrijving', () => {
        const A = importBc3File(toArrayBuffer(readFileSync(path.join(DIR, file))));
        const { bytes } = buildBc3Bytes(baseSchedule(A.schedule), recalculateItems(A.items));
        const B = importBc3File(toArrayBuffer(Buffer.from(bytes)));
        expect(B.schedule.projectName).toBe(A.schedule.projectName);
        expect(lf(B.schedule.description ?? '')).toBe(lf(A.schedule.description ?? ''));
      });
    });
  }

  afterAll(() => {
    if (rows.length === 0) return;
    // Alleen het gegenereerde blok wordt ververst; de handgeschreven analyse
    // eromheen (wat verloren gaat, afwijkingen verklaard, eindoordeel) blijft.
    const START = '<!-- gegenereerd:begin -->';
    const END = '<!-- gegenereerd:einde -->';
    const generated = `${START}\n${buildReport(rows)}${END}`;
    const existing = existsSync(REPORT) ? readFileSync(REPORT, 'utf-8') : '';
    const s = existing.indexOf(START);
    const e = existing.indexOf(END);
    const next = s >= 0 && e > s
      ? existing.slice(0, s) + generated + existing.slice(e + END.length)
      : `# FIEBDC-3 round trip — report\n\n${generated}\n`;
    writeFileSync(REPORT, next.replace(/\r\n/g, '\n'), { encoding: 'utf-8' });
  });
});

// ── Rapport (Engels) ────────────────────────────────────────────────────────

function buildReport(rows: Row[]): string {
  const out: string[] = [];
  const lossless = rows.filter((r) => r.diffs.length === 0 && r.itemsA === r.itemsB);
  const moneyOk = rows.filter((r) => Math.abs(r.totalA - r.totalB) <= TOL && r.itemsA === r.itemsB
    && r.diffs.every((d) => d.field === 'code'));
  const withRoot = rows.filter((r) => r.rootPrice != null && Math.abs(r.rootPrice) >= 0.005 && r.fragment == null);
  const rootOk = withRoot.filter((r) => Math.abs(r.totalA - (r.rootPrice ?? 0)) / Math.abs(r.rootPrice ?? 1) <= 0.0001);
  const fragments = rows.filter((r) => r.fragment != null);
  const rootDev = (r: Row): string => r.rootPrice == null ? 'n/a'
    : Math.abs(r.rootPrice) < 0.005 ? 'no root price (0)'
    : `${pct((r.totalA - r.rootPrice) / r.rootPrice)}${r.fragment ? ` (${r.fragment})` : ''}`;

  out.push('## Measurements');
  out.push('');
  out.push('Generated by `src/test/bc3Roundtrip.test.ts` (`npx vitest run src/test/bc3Roundtrip.test.ts`).');
  out.push('Round trip: import the file (A) → export as .bc3 (Windows-1252) → import again (B) → compare A and B row by row.');
  out.push('Tolerance for amounts: 0.01. "Items" counts chapters, items and resource rows after `recalculateItems`.');
  out.push('"Root price in file" is the price on the `##` concept of the original file; "Deviation" compares our bottom-up direct cost (A) with it.');
  out.push('');
  out.push('## Summary');
  out.push('');
  out.push(`- Files: ${rows.length}`);
  out.push(`- Identical after the round trip (no field differs): ${lossless.length}`);
  out.push(`- Amounts, descriptions, quantities and structure equal, only a code with an \`_n\` suffix: ${moneyOk.length - lossless.length}`);
  out.push(`- With other differences: ${rows.length - moneyOk.length}`);
  out.push(`- Files with a usable root price (non-zero, no missing concepts): ${withRoot.length}, of which within 0.01 % of our direct cost: ${rootOk.length}`);
  out.push(`- Fragments (the file references concepts it does not contain, or its root has no breakdown): ${fragments.length}${fragments.length > 0 ? ` (${fragments.map((r) => `\`${r.file}\``).join(', ')})` : ''}`);
  out.push('');

  out.push('## Per file');
  out.push('');
  out.push('| File | Program / version | Charset | Items A | Items B | Direct cost A | Direct cost B | Rows differing | Root price in file | Deviation of import vs. file |');
  out.push('| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const r of rows) {
    out.push(`| \`${r.file}\` | ${cell(`${r.header.program || '?'} — ${r.header.version || '?'}`)} | ${r.header.charset || '(none)'} | ${r.itemsA} | ${r.itemsB} | ${fmt(r.totalA)} | ${fmt(r.totalB)} | ${r.diffRows} | ${r.rootPrice == null ? 'n/a' : fmt(r.rootPrice)} | ${rootDev(r)} |`);
  }
  out.push('');

  out.push('## Import against the file itself');
  out.push('');
  out.push('Chapters: our total against the `~C` price of the chapter (only chapters with a non-zero price in the file). Items: our bottom-up unit price against the `~C` price of the item; "net effect" is Σ(difference × quantity) over all priced items, i.e. what the stored unit prices would add to or remove from our direct cost.');
  out.push('');
  out.push('| File | Chapters priced | Chapters differing (> 0.01) | Largest chapter difference | Items priced | Items differing (> 0.005) | Net effect on direct cost | Largest item difference |');
  out.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const r of rows) {
    const c = r.check;
    out.push(`| \`${r.file}\` | ${c.chaptersPriced} | ${c.chaptersOff} | ${c.chaptersPriced ? `${fmt(c.chapterMaxOff)} (\`${c.chapterMaxOffCode}\`)` : '—'} | ${c.postsPriced} | ${c.postsOff} | ${fmt(c.postsNet)} | ${c.postsPriced ? `${c.postsMaxOff.toFixed(4)} (\`${c.postsMaxOffCode}\`)` : '—'} |`);
  }
  out.push('');

  for (const r of rows) {
    out.push(`### ${r.file}`);
    out.push('');
    out.push(`- Owner: ${r.header.owner || '(empty)'}; program: ${r.header.program || '(empty)'}; format: ${r.header.version || '(empty)'}; charset: ${r.header.charset || '(not declared)'}`);
    out.push(`- Size: ${r.size.toLocaleString('en-US')} bytes, ${r.lines.toLocaleString('en-US')} lines`);
    out.push(`- Items A: ${r.itemsA} (${Object.entries(r.typeCounts).map(([k, v]) => `${k} ${v}`).join(', ')}); items B: ${r.itemsB}`);
    out.push(`- Direct cost A: ${fmt(r.totalA)}; B: ${fmt(r.totalB)}; difference: ${fmt(r.totalB - r.totalA)}`);
    if (r.rootPrice != null) out.push(`- Root price according to the file: ${fmt(r.rootPrice)} (import deviates ${rootDev(r)})`);
    out.push(`- Chapters with a price in the file: ${r.check.chaptersPriced}, differing from our total: ${r.check.chaptersOff}${r.check.chaptersPriced ? ` (largest: ${fmt(r.check.chapterMaxOff)} on \`${r.check.chapterMaxOffCode}\`)` : ''}`);
    out.push(`- Items with a price in the file: ${r.check.postsPriced}, unit price differing from the composition: ${r.check.postsOff}${r.check.postsPriced ? ` (net effect ${fmt(r.check.postsNet)}; largest ${r.check.postsMaxOff.toFixed(4)} on \`${r.check.postsMaxOffCode}\`)` : ''}`);
    out.push(`- Texts (~T) as notes: A ${r.notesA} items (${r.multilineA} multi-line), B ${r.notesB} (${r.multilineB} multi-line)`);
    out.push(`- Chapter totals differing between A and B: ${r.chapterDiffs}`);
    out.push(`- Charset of the export: ${r.charset}${r.charset === 'UTF-8' ? ' (text does not fit Windows-1252)' : ''}`);
    const rec = (c: Record<string, number>): string => Object.keys(c).sort().map((k) => `~${k} ${c[k]}`).join(', ') || '—';
    out.push(`- Record types in the original: ${rec(r.countsIn)}`);
    out.push(`- Record types in the export: ${rec(r.countsOut)}`);
    if (r.warningsA.length > 0) {
      out.push(`- Warnings on import A (${r.warningsA.length}):`);
      for (const w of r.warningsA.slice(0, 6)) out.push(`  - ${cell(w).slice(0, 60)}${w.length > 60 ? '…' : ''}`);
    } else {
      out.push('- Warnings on import A: none');
    }
    if (r.warningsB.length > 0) {
      out.push(`- Warnings on import B (${r.warningsB.length}): ${r.warningsB.map((w) => cell(w).slice(0, 60)).join(' / ')}`);
    }
    if (r.diffs.length > 0) {
      const byField: Record<string, number> = {};
      for (const d of r.diffs) byField[d.field] = (byField[d.field] ?? 0) + 1;
      out.push(`- Differences A vs. B: ${r.diffRows} row(s), per field: ${Object.entries(byField).map(([k, v]) => `${k} ${v}`).join(', ')}`);
      for (const d of r.diffs.slice(0, 3)) out.push(`  - item #${d.index} ${d.field}: \`${cell(d.a)}\` → \`${cell(d.b)}\``);
    } else {
      out.push('- Differences A vs. B: none');
    }
    out.push('');
  }
  return out.join('\n') + '\n';
}
