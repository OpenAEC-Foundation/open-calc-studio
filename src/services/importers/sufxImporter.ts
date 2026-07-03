import { parseXml } from './xmlHelpers';
import { BudgetBuilder } from './core';
import type { ImportResult } from './types';
import type { CostItem } from '@/types/costModel';

/**
 * SUFX-importer — STABU Bouwbreed XML (opvolger van SUF/.s01).
 *
 * Net als .s01 is dit een *bestek* (specificatie), geen calculatie: er staan
 * geen hoeveelheden of prijzen in. We bouwen een prijsloze skelet-begroting:
 * STABU-hoofdstukken → hoofdstukken, 6-cijfer besteksposten → begrotingsposten
 * met titel en bestekstekst (zie ook [[s01Importer]]).
 *
 * De exacte SUFX-tags variëren per uitgave; deze parser detecteert post-knopen
 * aan de STABU-code (attribuut of kind-element) en is daarom tolerant.
 * Controleer de uitkomst tegen een echt SUFX-bestand.
 */

const CODE_ATTRS = ['code', 'kode', 'nr', 'nummer', 'stabucode', 'besteknr'];
const TITLE_TAGS = ['titel', 'title', 'omschrijving', 'omschr', 'naam', 'kort'];
const TEXT_TAGS = ['tekst', 'text', 'bestekstekst', 'alinea'];

function extractCode(el: Element): string {
  for (const a of CODE_ATTRS) {
    const v = el.getAttribute(a);
    if (v && /\d/.test(v)) return v.trim();
  }
  for (const child of Array.from(el.children)) {
    if (CODE_ATTRS.includes(child.localName.toLowerCase()) && child.textContent && /\d/.test(child.textContent)) {
      return child.textContent.trim();
    }
  }
  return '';
}

/** Normaliseer naar "NN.NN.NN"; geef ook het 2-cijferige hoofdstuk terug. */
function normStabu(code: string): { code: string; hfdst: string; digits: string } | null {
  const digits = code.replace(/\D/g, '');
  if (digits.length >= 6) {
    const d = digits.slice(0, 6);
    return { code: `${d.slice(0, 2)}.${d.slice(2, 4)}.${d.slice(4, 6)}`, hfdst: d.slice(0, 2), digits: d };
  }
  if (digits.length >= 2) return { code, hfdst: digits.slice(0, 2), digits };
  return null;
}

function extractTitle(el: Element): string {
  for (const tag of TITLE_TAGS) {
    const c = Array.from(el.children).find((ch) => ch.localName.toLowerCase() === tag);
    if (c?.textContent?.trim()) return c.textContent.trim();
  }
  return (el.getAttribute('titel') ?? el.getAttribute('omschrijving') ?? '').trim();
}

function extractText(el: Element): string {
  const lines: string[] = [];
  for (const node of Array.from(el.getElementsByTagName('*'))) {
    if (TEXT_TAGS.includes(node.localName.toLowerCase())) {
      const t = node.textContent?.trim();
      if (t) lines.push(t);
    }
  }
  return [...new Set(lines)].join('\n');
}

export function importSufx(xml: string): ImportResult {
  const doc = parseXml(xml);
  const builder = new BudgetBuilder();
  const warnings: string[] = [];

  const chapterByHfdst = new Map<string, CostItem>();
  const ensureChapter = (hfdst: string): CostItem => {
    const existing = chapterByHfdst.get(hfdst);
    if (existing) return existing;
    const ch = builder.add({
      parentId: null, depth: 0, rowType: 'chapter', code: hfdst, description: `Hoofdstuk ${hfdst}`,
    });
    chapterByHfdst.set(hfdst, ch);
    return ch;
  };

  const all = Array.from(doc.getElementsByTagName('*'));
  const seen = new Set<string>();

  // 6-cijfer besteksposten → begrotingsposten.
  for (const el of all) {
    const rawCode = extractCode(el);
    if (!rawCode) continue;
    const norm = normStabu(rawCode);
    if (!norm || norm.digits.length < 6) continue;
    if (seen.has(norm.code)) continue;
    seen.add(norm.code);

    const chapter = ensureChapter(norm.hfdst);
    builder.add({
      parentId: chapter.id, depth: 1, rowType: 'begrotingspost',
      code: norm.code, description: extractTitle(el) || norm.code, unit: 'post', notes: extractText(el),
    });
  }

  // Hoofdstuktitels invullen uit 2-cijfer knopen, indien aanwezig.
  for (const el of all) {
    const digits = extractCode(el).replace(/\D/g, '');
    if (digits.length !== 2) continue;
    const ch = chapterByHfdst.get(digits);
    if (ch && ch.description === `Hoofdstuk ${digits}`) {
      const title = extractTitle(el);
      if (title) ch.description = title;
    }
  }

  if (builder.length === 0) warnings.push('Geen herkenbare STABU-besteksposten gevonden in het SUFX-bestand.');
  warnings.push('SUFX-bestek geïmporteerd als prijsloze skelet-begroting (geen hoeveelheden/prijzen). Controleer tegen het bronbestand.');

  return { schedule: { name: 'STABU-bestek (SUFX)' }, items: builder.items, warnings, format: 'sufx' };
}
