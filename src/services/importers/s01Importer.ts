import { BudgetBuilder } from './core';
import type { ImportResult } from './types';
import type { CostItem } from '@/types/costModel';

/**
 * S01-importer — STABU-uitwisselformaat (bestek).
 *
 * Een .s01 is een tekst-bestek (specificatie), géén calculatie: er staan geen
 * hoeveelheden of prijzen in. De importer bouwt daarom een prijsloze skelet-
 * begroting die je zelf kunt beprijzen: STABU-hoofdstukken worden hoofdstukken,
 * besteksposten worden begrotingsposten met hun titel en bestekstekst.
 *
 * Regelsoorten:
 *   #...                         → kop-metadata (project, auteur)
 *   @ST_BEGIN: / @ST_END         → sectiegrenzen
 *   B00.10.105 (+ -Innn-S01)     → STABU-standaardbepaling met tekst
 *   000110 .102                  → besteksposthoofd (STABU-code 00.01.10)
 *   000110 .S90... TITEL         → specificatieregel met titel (hoofdletters)
 *   000110 ...-I01-S01           → tekstvariant; ingesprongen regels = tekst
 *   000110 .102-END              → einde post
 */
export function importS01(text: string): ImportResult {
  const lines = text.split(/\r?\n/);
  const warnings: string[] = [];
  const builder = new BudgetBuilder();

  // ── Kop-metadata ──
  let projectName = '';
  let author = '';
  for (const l of lines) {
    if (!l.startsWith('#')) continue;
    const p = l.match(/Project:\s*(.+)/i);
    if (p) projectName = p[1].trim();
    const a = l.match(/Auteur:\s*(.+)/i);
    if (a) author = a[1].trim();
  }

  // ── Records ──
  const chapterByHfdst = new Map<string, CostItem>();
  let currentPost: { item: CostItem; notes: string[] } | null = null;
  let currentBase = '';

  const ensureChapter = (hfdst: string): CostItem => {
    let ch = chapterByHfdst.get(hfdst);
    if (ch) return ch;
    ch = builder.add({
      parentId: null,
      depth: 0,
      rowType: 'chapter',
      code: hfdst,
      description: `Hoofdstuk ${hfdst}`,
    });
    chapterByHfdst.set(hfdst, ch);
    return ch;
  };

  const flushPost = () => {
    if (currentPost) {
      const notes = currentPost.notes.join('\n').trim();
      if (notes) currentPost.item.notes = notes;
    }
    currentPost = null;
  };

  /** STABU-code + hoofdstuk uit een recordregel afleiden. */
  const parseCode = (line: string): { base: string; code: string; hfdst: string } | null => {
    if (/^B\d/.test(line)) {
      const b = line.slice(1).split('-')[0].trim(); // "00.10.105"
      const hfdst = b.slice(0, 2);
      return { base: 'B' + b, code: b, hfdst };
    }
    const m = line.match(/^(\d{6})\s/);
    if (m) {
      const d = m[1];
      const code = `${d.slice(0, 2)}.${d.slice(2, 4)}.${d.slice(4, 6)}`;
      return { base: d, code, hfdst: d.slice(0, 2) };
    }
    return null;
  };

  /** Titel = aaneengesloten hoofdletter-tekst aan het einde van een S-regel. */
  const extractTitle = (line: string): string => {
    const m = line.match(/\s([A-Z][A-Z0-9 ,.'()/&-]{2,})\s*$/);
    return m ? m[1].trim() : '';
  };

  for (const raw of lines) {
    if (!raw.trim()) continue;
    if (raw.startsWith('#') || raw.startsWith('@')) continue;

    if (/^\s/.test(raw)) {
      // Ingesprongen tekst hoort bij de huidige post.
      if (currentPost) currentPost.notes.push(raw.trim());
      continue;
    }

    const parsed = parseCode(raw);
    if (!parsed) continue;
    const isEnd = /-END\s*$/.test(raw);

    if (parsed.base !== currentBase) {
      flushPost();
      currentBase = parsed.base;
      const chapter = ensureChapter(parsed.hfdst);
      const post = builder.add({
        parentId: chapter.id,
        depth: 1,
        rowType: 'begrotingspost',
        code: parsed.code,
        description: parsed.code, // wordt vervangen door de eerste titel
        unit: 'post',
      });
      currentPost = { item: post, notes: [] };
    }

    if (isEnd) continue;

    const title = extractTitle(raw);
    if (title && currentPost && currentPost.item.description === parsed.code) {
      currentPost.item.description = title;
    }
  }
  flushPost();

  if (builder.length === 0) {
    warnings.push('S01-bestand bevat geen herkenbare besteksposten.');
  }
  warnings.push('STABU-bestek geïmporteerd als prijsloze skelet-begroting (het bronbestand bevat geen hoeveelheden of prijzen).');

  return {
    schedule: { name: projectName || 'STABU-bestek', projectName, author },
    items: builder.items,
    warnings,
    format: 's01',
  };
}
