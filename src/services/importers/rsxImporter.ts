import {
  parseXml,
  getText,
  getNumber,
  normalizeUnit,
  makeCostItem,
  genId,
  genIfcGuid,
} from './xmlHelpers';
import type { ImportResult } from './types';
import type { CostItem } from '@/types/costModel';

/**
 * RAW RSX importer (CROW) — GWW-sector.
 *
 * Ondersteunt twee dialecten en kiest automatisch:
 *  1. Het volledige CROW RAW-bestek (`dl22.*`-elementen): tussenhoofden als
 *     hoofdstuk-hiërarchie, 6-cijferposten met romptekst/tekstblok.
 *  2. Het eenvoudige/synthetische schema (`RAWBestand → Deelraming →
 *     Resultaatsverplichting`), o.a. wat OCS zelf exporteert (round-trip).
 */
export function importRsx(xml: string): ImportResult {
  const doc = parseXml(xml);
  const isRealRaw = doc.getElementsByTagName('dl22.vsub.compleet').length > 0;
  return isRealRaw ? importRealRaw(doc) : importSimpleRsx(doc);
}

// ── Eenvoudig/synthetisch schema ────────────────────────────────────────────

function importSimpleRsx(doc: Document): ImportResult {
  const warnings: string[] = [];
  const items: CostItem[] = [];

  const bestek = doc.getElementsByTagNameNS('*', 'Bestek')[0] ?? null;
  const name = getText(bestek, 'Naam') || 'RAW import';

  Array.from(doc.getElementsByTagNameNS('*', 'Deelraming')).forEach((d) => {
    const chapter = makeCostItem({
      parentId: null,
      sortOrder: items.length,
      depth: 0,
      rowType: 'chapter',
      code: d.getAttribute('code') ?? '',
      description: d.getAttribute('omschrijving') ?? '',
    });
    items.push(chapter);

    Array.from(d.getElementsByTagNameNS('*', 'Resultaatsverplichting')).forEach((rv) => {
      const qty = getNumber(rv, 'Hoeveelheid');
      const price = getNumber(rv, 'Prijs');
      items.push(
        makeCostItem({
          parentId: chapter.id,
          sortOrder: items.length,
          depth: 1,
          rowType: 'begrotingspost',
          code: rv.getAttribute('besteksnummer') ?? '',
          description: getText(rv, 'Omschrijving'),
          quantity: qty,
          unit: normalizeUnit(getText(rv, 'Eenheid')),
          unitPrice: price,
          total: qty * price,
        }),
      );
    });
  });

  if (items.length === 0) warnings.push('RSX bevat geen deelramingen.');

  return { schedule: { name }, items, warnings, format: 'rsx' };
}

// ── Volledig CROW RAW-bestek (dl22.*) ───────────────────────────────────────

/** Tekst van het eerste matchende afstammeling-element (exacte tagnaam). */
function rawText(el: Element, tagName: string): string {
  return el.getElementsByTagName(tagName)[0]?.textContent?.trim() ?? '';
}

/** Numerieke inhoud van het eerste matchende element; leeg → null. */
function rawNum(el: Element, tagName: string): number | null {
  const text = rawText(el, tagName);
  if (!text) return null;
  const n = Number(text);
  return isNaN(n) ? null : n;
}

/** Hoofdstukdiepte uit een tussenhoofdnummer afleiden. */
function getChapterDepth(nr: string): number {
  const n = parseInt(nr, 10);
  if (isNaN(n)) return 0;
  if (n < 10) return 0;
  if (n < 100) return 1;
  if (n < 10000) return 1;
  return 2;
}

/** Korte omschrijving uit romptekst / hoofdcode.hoofdtekst. */
function getFullDescription(bpost: Element): string {
  const parts: string[] = [];
  const romp = rawText(bpost, 'romptekst');
  if (romp) parts.push(romp);
  const hoofdtekst = bpost.getElementsByTagName('hoofdcode.hoofdtekst')[0];
  if (hoofdtekst) {
    const ht = hoofdtekst.textContent?.trim() ?? '';
    if (ht && ht !== romp) parts.push(ht);
  }
  return parts[0] ?? '';
}

/** Uitgebreide notities uit hoofdcode.tekstblok-alinea's. */
function getNotes(bpost: Element): string {
  const blocks = bpost.getElementsByTagName('hoofdcode.tekstblok');
  const lines: string[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const alineas = blocks[i].getElementsByTagName('alinea.hoofdcode');
    for (let j = 0; j < alineas.length; j++) {
      const text = alineas[j].textContent?.trim();
      if (text) lines.push(text);
    }
  }
  return lines.join('\n');
}

function importRealRaw(doc: Document): ImportResult {
  const items: CostItem[] = [];
  const warnings: string[] = [];
  let sortOrder = 0;

  const contractInfo = doc.getElementsByTagName('raw.contractinfo')[0];
  const bestekNr = contractInfo ? rawText(contractInfo, 'raw.bestek.nr') : '';
  const bestekOmschrijving = contractInfo ? rawText(contractInfo, 'raw.bestek.omschrijving') : '';

  // Tussenhoofd-hiërarchie bijhouden.
  const chapterStack: { id: string; depth: number; nr: string }[] = [];
  const vsubSections = doc.getElementsByTagName('dl22.vsub.compleet');

  for (let s = 0; s < vsubSections.length; s++) {
    const vsub = vsubSections[s];
    for (let c = 0; c < vsub.children.length; c++) {
      const child = vsub.children[c];
      const tagName = child.tagName;

      if (tagName === 'dl22.bpost.tussenhoofd') {
        const nr = rawText(child, 'dl22.bpost.tussenhoofdnr');
        const description = rawText(child, 'romptekst');
        const depth = getChapterDepth(nr);
        while (chapterStack.length > 0 && chapterStack[chapterStack.length - 1].depth >= depth) {
          chapterStack.pop();
        }
        const parentId = chapterStack.length > 0 ? chapterStack[chapterStack.length - 1].id : null;
        const item = makeCostItem({
          parentId, sortOrder: sortOrder++, code: nr, description, depth,
          rowType: 'chapter', unit: 'st', verrekenbaar: 'V',
        });
        items.push(item);
        chapterStack.push({ id: item.id, depth, nr });
      } else if (tagName === 'dl22.resultaatsverpl') {
        const parentChapterId = chapterStack.length > 0 ? chapterStack[chapterStack.length - 1].id : null;
        const parentDepth = chapterStack.length > 0 ? chapterStack[chapterStack.length - 1].depth + 1 : 0;

        for (let b = 0; b < child.children.length; b++) {
          const bpost = child.children[b];
          const bpostTag = bpost.tagName;
          if (bpostTag === 'dl22.bpost.6cijfer.0' || bpostTag === 'dl22.bpost.6cijfer.volg') {
            const postNr = rawText(bpost, 'dl22.bpost.nr6.0') || rawText(bpost, 'dl22.bpost.nr6.volg');
            const description = getFullDescription(bpost);
            const notes = getNotes(bpost);

            const unitEl = bpost.getElementsByTagName('dl22.eenheid.res.verpl')[0];
            const unitText = unitEl?.textContent?.trim() ?? '';
            const unit = unitText ? normalizeUnit(unitText) : 'st';

            const qtyRes = rawNum(bpost, 'dl22.hoev.res.verpl');
            const qtyInl = rawNum(bpost, 'dl22.hoev.ter.inl');
            const quantity = qtyRes ?? qtyInl;

            const qtyEl = bpost.getElementsByTagName('dl22.hoev.res.verpl')[0]
              || bpost.getElementsByTagName('dl22.hoev.ter.inl')[0];
            const qtyKenmerk = qtyEl?.getAttribute('kenmerk') ?? '';

            const item = makeCostItem({
              parentId: parentChapterId, sortOrder: sortOrder++, code: postNr, description,
              unit, quantity, depth: parentDepth, rowType: 'begrotingspost',
              notes: [
                qtyKenmerk ? `Hoeveelheid: ${qtyKenmerk === 'V' ? 'Verrekenbaar' : qtyKenmerk === 'N' ? 'Niet verrekenbaar' : 'Ter inlichting'}` : '',
                notes,
              ].filter(Boolean).join('\n'),
            });
            items.push(item);

            // tekstblok-alinea's als witregels onder de post.
            const blocks = bpost.getElementsByTagName('hoofdcode.tekstblok');
            for (let tb = 0; tb < blocks.length; tb++) {
              const alineas = blocks[tb].getElementsByTagName('alinea.hoofdcode');
              const witText: string[] = [];
              for (let a = 0; a < alineas.length; a++) {
                const t = alineas[a].textContent?.trim();
                if (t) witText.push(t);
              }
              if (witText.length > 0) {
                items.push(makeCostItem({
                  parentId: item.id, sortOrder: sortOrder++,
                  description: witText.join('\n'), depth: parentDepth + 1, rowType: 'witregel',
                }));
              }
            }
          }
        }
      }
    }
  }

  if (items.length === 0) warnings.push('RSX bevat geen besteksposten.');

  return {
    schedule: {
      id: genId(),
      name: bestekOmschrijving || `RSX Import ${bestekNr}`,
      description: `Bestek ${bestekNr}`,
      status: 'DRAFT',
      predefinedType: 'ESTIMATE',
      currency: 'EUR',
      projectName: bestekOmschrijving || '',
      projectNumber: bestekNr || '',
      client: '',
      author: '',
      ifcGuid: genIfcGuid(),
      uitvoeringskosten: 6,
      algemeneKosten: 9,
      winstRisico: 5,
    },
    items,
    warnings,
    format: 'rsx',
  };
}
