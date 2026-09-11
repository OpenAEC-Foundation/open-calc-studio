import { describe, it, expect, afterAll } from 'vitest';
import { existsSync, readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { importBc3File, decodeBc3 } from '@/services/importers/bc3Importer';
import { buildBc3, buildBc3Bytes } from '@/services/export/bc3Exporter';
import { recalculateItems, getKostprijs } from '@/services/calculation/calculator';
import type { ImportResult } from '@/services/importers/types';
import type { CostItem, CostSchedule } from '@/types/costModel';

/**
 * Rondreis over echte FIEBDC-3-bestanden: importeren (A) → exporteren →
 * opnieuw importeren (B) → A en B regel voor regel vergelijken. De bestanden
 * staan in `verification/bc3/` (zie de README daar voor de herkomst); als de
 * map ontbreekt wordt de hele suite overgeslagen. Het overzicht komt in
 * `verification/bc3/RAPPORT.md`.
 */

// vitest draait vanuit de projectwortel (jsdom kent geen file-URL's).
const DIR = path.resolve(process.cwd(), 'verification', 'bc3');
const REPORT = path.join(DIR, 'RAPPORT.md');
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

const fmt = (n: number): string => n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n: number): string => `${(n * 100).toFixed(2).replace('.', ',')} %`;
const cell = (s: string | number): string => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 60);

interface Row {
  file: string; size: number; lines: number; header: ReturnType<typeof headerInfo>;
  itemsA: number; itemsB: number; totalA: number; totalB: number;
  rootPrice: number | null; diffs: Diff[]; diffRows: number; warningsA: string[]; warningsB: string[];
  countsIn: Record<string, number>; countsOut: Record<string, number>;
  notesA: number; notesB: number; multilineA: number; multilineB: number;
  chapterDiffs: number; typeCounts: Record<string, number>;
  charset: string;
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
    warningsA: A.warnings,
    warningsB: B.warnings,
    countsIn: recordCounts(original),
    countsOut: recordCounts(text),
    notesA: itemsA.filter((it) => it.notes).length,
    notesB: itemsB.filter((it) => it.notes).length,
    multilineA: itemsA.filter((it) => /\n/.test(it.notes)).length,
    multilineB: itemsB.filter((it) => /\n/.test(it.notes)).length,
    chapterDiffs,
    typeCounts,
    charset,
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
    // eromheen (wat verloren gaat, eindoordeel) blijft staan.
    const START = '<!-- gegenereerd:begin -->';
    const END = '<!-- gegenereerd:einde -->';
    const generated = `${START}\n${buildReport(rows)}${END}`;
    const existing = existsSync(REPORT) ? readFileSync(REPORT, 'utf-8') : '';
    const s = existing.indexOf(START);
    const e = existing.indexOf(END);
    const next = s >= 0 && e > s
      ? existing.slice(0, s) + generated + existing.slice(e + END.length)
      : `# FIEBDC-3 rondreis — rapport\n\n${generated}\n`;
    writeFileSync(REPORT, next.replace(/\r\n/g, '\n'), { encoding: 'utf-8' });
  });
});

// ── Rapport ─────────────────────────────────────────────────────────────────

function buildReport(rows: Row[]): string {
  const out: string[] = [];
  const lossless = rows.filter((r) => r.diffs.length === 0 && r.itemsA === r.itemsB);
  const moneyOk = rows.filter((r) => Math.abs(r.totalA - r.totalB) <= TOL && r.itemsA === r.itemsB
    && r.diffs.every((d) => d.field === 'code'));
  out.push('## Meetresultaten');
  out.push('');
  out.push('Automatisch gegenereerd door `src/test/bc3Roundtrip.test.ts` (`npx vitest run src/test/bc3Roundtrip.test.ts`).');
  out.push('Rondreis: bestand importeren (A) → exporteren als .bc3 (Windows-1252) → opnieuw importeren (B) → A en B regel voor regel vergelijken.');
  out.push('Tolerantie voor bedragen: 0,01. "Items" telt hoofdstukken, posten en rekenregels na `recalculateItems`.');
  out.push('');
  out.push('## Samenvatting');
  out.push('');
  out.push(`- Bestanden: ${rows.length}`);
  out.push(`- Volledig identiek na de rondreis (geen enkel veldverschil): ${lossless.length}`);
  out.push(`- Bedragen, omschrijvingen, hoeveelheden en structuur gelijk, alleen een code met \`_n\`-suffix: ${moneyOk.length - lossless.length}`);
  out.push(`- Met andere afwijkingen: ${rows.length - moneyOk.length}`);
  out.push('');

  out.push('## Per bestand');
  out.push('');
  out.push('| Bestand | Programma / versie | Tekenset | Items A | Items B | Kostprijs A | Kostprijs B | Regels met verschil | Wortelprijs in bestand | Afwijking import t.o.v. bestand |');
  out.push('| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const r of rows) {
    const rootCmp = r.rootPrice == null ? 'n.v.t.'
      : Math.abs(r.rootPrice) < 0.005 ? 'geen wortelprijs (0)'
      : pct((r.totalA - r.rootPrice) / r.rootPrice);
    out.push(`| \`${r.file}\` | ${cell(`${r.header.program || '?'} — ${r.header.version || '?'}`)} | ${r.header.charset || '(geen)'} | ${r.itemsA} | ${r.itemsB} | ${fmt(r.totalA)} | ${fmt(r.totalB)} | ${r.diffRows} | ${r.rootPrice == null ? 'n.v.t.' : fmt(r.rootPrice)} | ${rootCmp} |`);
  }
  out.push('');

  for (const r of rows) {
    out.push(`### ${r.file}`);
    out.push('');
    out.push(`- Schrijver: ${r.header.owner || '(leeg)'}; programma: ${r.header.program || '(leeg)'}; formaat: ${r.header.version || '(leeg)'}; tekenset: ${r.header.charset || '(niet opgegeven)'}`);
    out.push(`- Grootte: ${r.size.toLocaleString('nl-NL')} bytes, ${r.lines.toLocaleString('nl-NL')} regels`);
    out.push(`- Items A: ${r.itemsA} (${Object.entries(r.typeCounts).map(([k, v]) => `${k} ${v}`).join(', ')}); items B: ${r.itemsB}`);
    out.push(`- Kostprijs A: ${fmt(r.totalA)}; B: ${fmt(r.totalB)}; verschil: ${fmt(r.totalB - r.totalA)}`);
    if (r.rootPrice != null) out.push(`- Wortelprijs volgens het bestand zelf: ${fmt(r.rootPrice)} (import wijkt ${Math.abs(r.rootPrice) < 0.005 ? 'n.v.t.' : pct((r.totalA - r.rootPrice) / r.rootPrice)} af)`);
    out.push(`- Teksten (~T) als notities: A ${r.notesA} items (${r.multilineA} meerregelig), B ${r.notesB} (${r.multilineB} meerregelig)`);
    out.push(`- Hoofdstuktotalen met verschil: ${r.chapterDiffs}`);
    out.push(`- Tekenset van de export: ${r.charset}${r.charset === 'UTF-8' ? ' (tekst past niet in Windows-1252)' : ''}`);
    const rec = (c: Record<string, number>): string => Object.keys(c).sort().map((k) => `~${k} ${c[k]}`).join(', ') || '—';
    out.push(`- Recordtypen origineel: ${rec(r.countsIn)}`);
    out.push(`- Recordtypen export: ${rec(r.countsOut)}`);
    if (r.warningsA.length > 0) {
      out.push(`- Waarschuwingen bij import A (${r.warningsA.length}):`);
      for (const w of r.warningsA.slice(0, 6)) out.push(`  - ${cell(w).slice(0, 60)}${w.length > 60 ? '…' : ''}`);
    } else {
      out.push('- Waarschuwingen bij import A: geen');
    }
    if (r.warningsB.length > 0) {
      out.push(`- Waarschuwingen bij import B (${r.warningsB.length}): ${r.warningsB.map((w) => cell(w).slice(0, 60)).join(' / ')}`);
    }
    if (r.diffs.length > 0) {
      const byField: Record<string, number> = {};
      for (const d of r.diffs) byField[d.field] = (byField[d.field] ?? 0) + 1;
      out.push(`- Afwijkingen: ${r.diffRows} regel(s), per veld: ${Object.entries(byField).map(([k, v]) => `${k} ${v}`).join(', ')}`);
      for (const d of r.diffs.slice(0, 3)) out.push(`  - item #${d.index} ${d.field}: \`${cell(d.a)}\` → \`${cell(d.b)}\``);
    } else {
      out.push('- Afwijkingen: geen');
    }
    out.push('');
  }
  return out.join('\n') + '\n';
}
