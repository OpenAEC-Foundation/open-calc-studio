import {
  parseXml,
  getText,
  getNumber,
  getNumberOrDefault,
  children,
  descendants,
  normalizeUnit,
  makeCostItem,
} from './xmlHelpers';
import type { ResourceType } from '@/types/costModel';
import type { ImportResult } from './types';
import type { CostItem } from '@/types/costModel';

/**
 * CUF-XML importer (Calculatie Uitwisselings Formaat 4.003).
 *
 * Ondersteunt twee varianten:
 *  1. Het standaard CUF-schema: <CUF> met <PROJECTGEGEVENS> en een <BEGROTING>
 *     met geneste <BUNDELING>-knopen (hoofdstukken/posten) en <BEGROTINGSREGEL>-
 *     regels. Alle gegevens staan in hoofdletter-attributen. Dit is het formaat
 *     dat externe calculatiepakketten uitwisselen.
 *  2. Het eenvoudige OCS-eigen schema (<Calculatie><Hoofdstuk><Post>…), zoals
 *     OCS zelf exporteert, voor round-trips en oudere bestanden.
 *
 * De juiste variant wordt automatisch herkend aan het wortelelement.
 */
export function importCuf(xml: string): ImportResult {
  const doc = parseXml(xml);
  const root = doc.documentElement;

  const looksLikeStandardCuf =
    root.localName === 'CUF' ||
    descendants(root, 'BEGROTING').length > 0 ||
    descendants(root, 'BUNDELING').length > 0;

  return looksLikeStandardCuf ? importStandardCuf(doc) : importLegacyCuf(doc);
}

// ── Standaard CUF 4.003 (BUNDELING / BEGROTINGSREGEL) ───────────────────────

/** Getal uit een attribuut (NL- of EN-decimaal); leeg/onleesbaar → 0. */
function attrNum(el: Element, name: string): number {
  const raw = (el.getAttribute(name) ?? '').trim();
  if (!raw) return 0;
  const t = raw.indexOf(',') >= 0 ? raw.replace(/\./g, '').replace(',', '.') : raw;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Het uurtarief staat in CUF als attribuut UUR_TARIEF, maar zonder
 * decimaalteken (bv. "513" = € 51,30) en zonder losse tarieventabel. Breng een
 * overduidelijk te hoog geheel tarief terug naar een realistisch uurtarief.
 */
function normalizeTarief(raw: number): number {
  let t = raw;
  while (t > 200) t /= 10;
  return t;
}

interface RegelComponent {
  resourceType: ResourceType;
  normQuantity: number;
  normUnitPrice: number;
}

/**
 * Eén BEGROTINGSREGEL kan meerdere kostencomponenten dragen (uren én materiaal).
 * Per niet-lege kolom één component, met dezelfde regelformule als elders:
 *   - arbeid (UUR_NORM = uren/eenheid): normQuantity = UUR_NORM, prijs = uurtarief
 *   - materiaal / materieel / onderaanneming: normQuantity = 1, prijs = de
 *     eenheidsprijs uit MATERIAALPRIJS / MATERIEELPRIJS / ONDERAANNEMINGSPRIJS
 */
function componentsFromRegel(el: Element, uurtarief: number): RegelComponent[] {
  const uurNorm = attrNum(el, 'UUR_NORM');
  const mat = attrNum(el, 'MATERIAALPRIJS');
  const mte = attrNum(el, 'MATERIEELPRIJS');
  const oa = attrNum(el, 'ONDERAANNEMINGSPRIJS');
  const out: RegelComponent[] = [];
  if (uurNorm > 0) out.push({ resourceType: 'arbeid', normQuantity: uurNorm, normUnitPrice: uurtarief });
  if (mat > 0) out.push({ resourceType: 'materiaal', normQuantity: 1, normUnitPrice: mat });
  if (mte > 0) out.push({ resourceType: 'materieel', normQuantity: 1, normUnitPrice: mte });
  if (oa > 0) out.push({ resourceType: 'onderaannemer', normQuantity: 1, normUnitPrice: oa });
  return out;
}

function importStandardCuf(doc: Document): ImportResult {
  const root = doc.documentElement;
  const warnings: string[] = [];
  const items: CostItem[] = [];

  const proj = descendants(root, 'PROJECTGEGEVENS')[0];
  const name = proj?.getAttribute('PROJECTNAAM')?.trim() || 'Geïmporteerde begroting';

  const begroting = descendants(root, 'BEGROTING')[0];
  if (!begroting) {
    warnings.push('Geen <BEGROTING> gevonden in het CUF-bestand.');
    return { schedule: { name }, items, warnings, format: 'cuf' };
  }

  // Eén gedeeld uurtarief: uit UUR_TARIEF (geen losse tarieventabel in CUF).
  const firstRegel = descendants(begroting, 'BEGROTINGSREGEL').find(
    (r) => (r.getAttribute('UUR_TARIEF') ?? '').trim() !== '',
  );
  const uurtarief = firstRegel ? normalizeTarief(attrNum(firstRegel, 'UUR_TARIEF')) : 0;
  let usedDerivedTarief = false;

  let sort = 0;

  const addRegels = (bundeling: Element, postId: string, depth: number) => {
    let rsort = 0;
    for (const reg of children(bundeling, 'BEGROTINGSREGEL')) {
      const omschrijving = (reg.getAttribute('OMSCHRIJVING') ?? '').trim();
      const qty =
        attrNum(reg, 'HOEVEELHEID') *
        (attrNum(reg, 'INZET') || 1) *
        (attrNum(reg, 'HOEVEELHEID_FACTOR') || 1);
      const unit = normalizeUnit(reg.getAttribute('HOEVEELHEID_EENHEID') ?? '');
      const comps = componentsFromRegel(reg, uurtarief);

      if (comps.length === 0) {
        // Regel zonder bedrag (bv. een "incl."-subregel): toon hem informatief.
        if (!omschrijving) continue;
        items.push(
          makeCostItem({
            parentId: postId, sortOrder: rsort++, depth, rowType: 'regel',
            code: (reg.getAttribute('CODE') ?? '').trim(), description: omschrijving,
            unit, quantity: qty || null,
            normQuantity: 0, normFactor: 1, normDivisor: 1, normUnitPrice: 0,
            resourceType: 'overig',
          }),
        );
        continue;
      }

      for (const c of comps) {
        if (c.resourceType === 'arbeid' && uurtarief > 0) usedDerivedTarief = true;
        const label = comps.length > 1 ? `${omschrijving} (${c.resourceType})` : omschrijving;
        items.push(
          makeCostItem({
            parentId: postId, sortOrder: rsort++, depth, rowType: 'regel',
            code: (reg.getAttribute('CODE') ?? '').trim(),
            description: label || '(regel)',
            unit, quantity: qty || null,
            normQuantity: c.normQuantity, normFactor: 1, normDivisor: 1,
            normUnitPrice: c.normUnitPrice, resourceType: c.resourceType,
          }),
        );
      }
    }
  };

  /** Recursief: een BUNDELING met sub-BUNDELINGen = hoofdstuk, anders = post. */
  const walk = (bundeling: Element, parentId: string | null, depth: number) => {
    const subBundels = children(bundeling, 'BUNDELING');
    const code = (bundeling.getAttribute('CODE') ?? '').trim();
    const omschrijving = (bundeling.getAttribute('OMSCHRIJVING') ?? '').trim();

    if (subBundels.length > 0) {
      const chapter = makeCostItem({
        parentId, sortOrder: sort++, depth, rowType: 'chapter',
        code, description: omschrijving,
      });
      items.push(chapter);
      // Eventuele losse regels direct onder een hoofdstuk: hang ze er toch onder.
      if (children(bundeling, 'BEGROTINGSREGEL').length > 0) addRegels(bundeling, chapter.id, depth + 1);
      for (const sub of subBundels) walk(sub, chapter.id, depth + 1);
    } else {
      const post = makeCostItem({
        parentId, sortOrder: sort++, depth, rowType: 'begrotingspost',
        code, description: omschrijving,
        unit: normalizeUnit(bundeling.getAttribute('EENHEID') ?? ''),
        quantity: attrNum(bundeling, 'TERUGDEEL_HOEVEELHEID') || null,
      });
      items.push(post);
      addRegels(bundeling, post.id, depth + 1);
    }
  };

  for (const top of children(begroting, 'BUNDELING')) walk(top, null, 0);

  if (usedDerivedTarief) {
    warnings.push(
      `Uurtarief € ${uurtarief.toFixed(2)} afgeleid uit het bestand (CUF bevat geen tarieventabel); controleer dit zo nodig.`,
    );
  }
  if (items.length === 0) warnings.push('CUF-bestand bevat geen posten of regels.');

  const schedule = uurtarief > 0
    ? { name, projectName: name, tarieven: { A: uurtarief } }
    : { name, projectName: name };
  return { schedule, items, warnings, format: 'cuf' };
}

// ── OCS-eigen schema (<Calculatie><Hoofdstuk><Post>…) ───────────────────────

function importLegacyCuf(doc: Document): ImportResult {
  const root = doc.documentElement;
  const warnings: string[] = [];
  const items: CostItem[] = [];

  const name = getText(root, 'Naam') || 'Geïmporteerde begroting';

  children(root, 'Hoofdstuk').forEach((h, idx) => {
    const chapter = makeCostItem({
      parentId: null,
      sortOrder: items.length,
      depth: 0,
      rowType: 'chapter',
      code: h.getAttribute('code') ?? `H${idx + 1}`,
      description: h.getAttribute('omschrijving') ?? '',
    });
    items.push(chapter);

    children(h, 'Post').forEach((p) => {
      const qty = getNumber(p, 'Hoeveelheid');
      const price = getNumber(p, 'Prijs');
      const post = makeCostItem({
        parentId: chapter.id,
        sortOrder: items.length,
        depth: 1,
        rowType: 'begrotingspost',
        code: p.getAttribute('code') ?? '',
        description: p.getAttribute('omschrijving') ?? '',
        quantity: qty,
        unit: normalizeUnit(getText(p, 'Eenheid')),
        unitPrice: price,
        total: qty * price,
      });
      items.push(post);

      // Middel children (arbeid/materiaal/materieel/onderaannemer/overig)
      children(p, 'Middel').forEach((m) => {
        const typeAttr = (m.getAttribute('type') ?? '').toLowerCase();
        const resourceType: ResourceType =
          typeAttr === 'arbeid' ? 'arbeid' :
          typeAttr === 'materiaal' ? 'materiaal' :
          typeAttr === 'materieel' ? 'materieel' :
          (typeAttr === 'onderaanneming' || typeAttr === 'onderaannemer') ? 'onderaannemer' :
          'overig';
        items.push(
          makeCostItem({
            parentId: post.id,
            sortOrder: items.length,
            depth: 2,
            rowType: 'regel',
            code: m.getAttribute('code') ?? '',
            description: m.getAttribute('omschrijving') ?? '',
            quantity: getNumber(m, 'Hoeveelheid'),
            unit: normalizeUnit(getText(m, 'Eenheid')),
            unitPrice: getNumber(m, 'Prijs'),
            normFactor: getNumberOrDefault(m, 'Normfactor', 1),
            normDivisor: getNumberOrDefault(m, 'Normdeler', 1),
            resourceType,
          }),
        );
      });

      // Toeslag: warn, don't import (not mapped in OCS model)
      children(p, 'Toeslag').forEach((t) => {
        const tCode = t.getAttribute('code') ?? '?';
        warnings.push(
          `Toeslag "${tCode}" wordt niet geïmporteerd (niet ondersteund in OCS model)`,
        );
      });
    });
  });

  if (items.length === 0) warnings.push('CUF-bestand bevat geen hoofdstukken of posten.');

  return { schedule: { name }, items, warnings, format: 'cuf' };
}
