import type { CostItem } from '@/types/costModel';
import { isStagartRowType } from '@/types/costModel';

/**
 * Canonieke item-volgorde: depth-first per parentId, zodat kinderen altijd
 * direct (aaneengesloten) onder hun ouder staan. Dit is dé invariant waar de
 * rest van de app op leunt — rapportages, prints, exporters, nummering en
 * verplaats-/invoeglogica lezen de array sequentieel en zijn alleen correct
 * als deze volgorde klopt. Importeurs en de MCP-bridge voegen items echter
 * plat (achteraan) toe; daarom normaliseert recalculateItems de volgorde bij
 * elke herberekening.
 *
 * Regels:
 * - sibling-volgorde = bestaande relatieve array-volgorde (stabiel; respecteert
 *   versleep-acties die alléén de array herordenen);
 * - depth wordt her-afgeleid uit de boom; sortOrder wordt vastgelegd als de
 *   uiteindelijke sibling-index (voor externe lezers van opgeslagen bestanden);
 * - onbereikbare items (wees met onbekende parentId, of cyclus) blijven
 *   behouden en komen ná de reguliere boom — data verdwijnt nooit stilletjes;
 * - staart_* regels staan altijd helemaal achteraan.
 */
export function normalizeItemOrder(items: CostItem[]): CostItem[] {
  const byParent = new Map<string | null, CostItem[]>();
  const staart: CostItem[] = [];
  for (const item of items) {
    if (item.parentId === undefined) item.parentId = null;
    if (isStagartRowType(item.rowType)) {
      staart.push(item);
      continue;
    }
    const key = item.parentId;
    const list = byParent.get(key);
    if (list) list.push(item);
    else byParent.set(key, [item]);
  }

  const ordered: CostItem[] = [];
  const seen = new Set<string>();
  const walk = (parentId: string | null, depth: number) => {
    const kids = byParent.get(parentId);
    if (!kids) return;
    for (let i = 0; i < kids.length; i++) {
      const item = kids[i];
      if (seen.has(item.id)) continue; // cyclus-guard
      seen.add(item.id);
      item.depth = depth;
      item.sortOrder = i;
      ordered.push(item);
      walk(item.id, depth + 1);
    }
  };
  walk(null, 0);

  // Wezen/cycli: behouden in hun bestaande relatieve volgorde.
  for (const item of items) {
    if (!isStagartRowType(item.rowType) && !seen.has(item.id)) {
      seen.add(item.id);
      ordered.push(item);
    }
  }

  return [...ordered, ...staart];
}

export function recalculateItems(items: CostItem[], tarieven?: Record<string, number>): CostItem[] {
  const result = normalizeItemOrder(items.map(item => ({ ...item })));

  // Recompute laborPrice from tariefGroep + tarieven when tarieven are provided.
  // Alleen voor regels mét een productienorm: laborPrice = norm × uurtarief.
  // Regels zonder norm hebben een direct ingevuld uurloon — dat moet blijven
  // staan (norm=null → 0 × tarief zou het uurloon stilletjes wissen bij
  // elke willekeurige bewerking elders in de begroting).
  if (tarieven) {
    for (const item of result) {
      if (item.rowType === 'regel' && item.tariefGroep && item.normQuantity != null) {
        const tarief = tarieven[item.tariefGroep] ?? 0;
        item.laborPrice = item.normQuantity * tarief;
      }
    }
  }

  // Build parent->children map
  const childrenMap = new Map<string | null, CostItem[]>();
  for (const item of result) {
    const list = childrenMap.get(item.parentId) ?? [];
    list.push(item);
    childrenMap.set(item.parentId, list);
  }

  // First pass: calculate leaf items (begrotingspost without children, and regel rows)
  for (const item of result) {
    if (item.rowType === 'regel') {
      // Hoeveelheid = Aantal × Productienorm / Productiecapaciteit
      const qty = item.quantity ?? 0;
      const norm = item.normQuantity ?? 0;
      const cap = item.normFactor ?? 1;
      const nup = item.normUnitPrice ?? 0;
      const lab = item.laborPrice ?? 0;
      const hoeveelheid = qty * norm / (cap || 1);
      // Two calculation models:
      // UI-2/WpCalc (work-based): total = aantal × (prijs + laborPrice)
      //   Used when: laborPrice > 0, or norm=0 with direct price (onderaanneming etc.)
      // UI-1 (resource-based): total = hoeveelheid × prijs/middel
      //   Used when: norm > 0 and no separate laborPrice
      if (lab > 0 || norm === 0) {
        // WpCalc / direct-price model: kosteneh = normUnitPrice + laborPrice per unit
        item.unitPrice = qty * (nup + lab);
      } else {
        // UI-1 model: eenheidsprijs = hoeveelheid × prijs/middel
        item.unitPrice = hoeveelheid * nup;
      }
      item.total = item.unitPrice;
    } else if (item.rowType === 'begrotingspost' || item.rowType === 'bewakingspost') {
      // Kale (bewakings)post zonder kinderen: eigen prijs telt —
      // prijs/middel (normUnitPrice) plus materiaal en loon.
      const children = childrenMap.get(item.id) ?? [];
      if (children.length === 0) {
        const mat = item.materialPrice ?? 0;
        const lab = item.laborPrice ?? 0;
        const nup = item.normUnitPrice ?? 0;
        item.unitPrice = nup + mat + lab;
        item.total = (item.quantity ?? 0) * item.unitPrice;
      }
      // If has children, total will be computed bottom-up below
    }
  }

  // Eigen berekening van een (bewakings)post: aantal × (prijs/middel + mat + loon).
  // Gebruikt als de kinderen (nog) niets opleveren — een op de post ingevulde
  // prijs mag niet verdwijnen zodra er een lege bewakingspost of tekstregel
  // onder hangt.
  const ownTotal = (item: CostItem): number => {
    const price = (item.normUnitPrice ?? 0) + (item.materialPrice ?? 0) + (item.laborPrice ?? 0);
    return (item.quantity ?? 0) * price;
  };

  // Special first pass for bewakingspost: quantity acts as multiplier
  // Must be done before second pass so the bewakingspost subtree total is correct
  // (handled in second pass after child summation)

  // Second pass: bottom-up summation for containers
  function calcTotal(parentId: string): number {
    const children = childrenMap.get(parentId) ?? [];
    let sum = 0;
    for (const child of children) {
      if (child.rowType === 'chapter' || child.rowType === 'begrotingspost' || child.rowType === 'bewakingspost') {
        const childChildren = childrenMap.get(child.id) ?? [];
        if (childChildren.length > 0) {
          let childSum = calcTotal(child.id);
          const own = (child.rowType !== 'chapter' && childSum === 0) ? ownTotal(child) : 0;
          if (own !== 0) {
            // Kinderen leveren (nog) niets op: de eigen post-prijs telt door.
            child.total = own;
            child.unitPrice = child.quantity ? own / child.quantity : own;
            childSum = own;
          } else {
            // Total is always the bottom-up sum of children
            child.total = childSum;
            // Eenheidsprijs rollup
            if (child.rowType === 'bewakingspost') {
              // Bewakingspost: unitPrice = sum of child unitPrices
              child.unitPrice = childChildren
                .filter(c => !isStagartRowType(c.rowType))
                .reduce((s, c) => s + (c.unitPrice ?? 0), 0);
            } else if (child.rowType === 'begrotingspost') {
              // Begrotingspost: unitPrice = total / quantity (afgeleide waarde voor weergave)
              if (child.quantity != null && child.quantity !== 0) {
                child.unitPrice = childSum / child.quantity;
              } else {
                child.unitPrice = childChildren
                  .filter(c => !isStagartRowType(c.rowType))
                  .reduce((s, c) => s + (c.unitPrice ?? 0), 0);
              }
            }
          }
        }
      }

      // Only include non-staart items in parent sums
      if (!isStagartRowType(child.rowType)) {
        sum += child.total;
      }
    }
    return sum;
  }

  // Calculate totals for ALL top-level items (chapters) that have children
  for (const item of result) {
    if (item.parentId === null && !isStagartRowType(item.rowType)) {
      const children = childrenMap.get(item.id) ?? [];
      if (children.length > 0) {
        item.total = calcTotal(item.id);
      }
    }
  }

  // Third pass: calculate staartkosten (cascading surcharges)
  const totaalKolommen = result
    .filter(item => item.parentId === null && !isStagartRowType(item.rowType))
    .reduce((sum, item) => sum + item.total, 0);

  // Sum of only the onderaanneming portion (regel rows with resourceType === 'onderaannemer')
  const oaPortie = result
    .filter(item => item.rowType === 'regel' && item.resourceType === 'onderaannemer')
    .reduce((sum, item) => sum + item.total, 0);

  // Track running totals for the Bouw 1 cascading staart model
  let kostprijs = totaalKolommen; // will accumulate ak_oa + abk + garanties + wvpm
  let runningTotal = totaalKolommen; // legacy model running total

  for (const item of result) {
    if (!isStagartRowType(item.rowType)) continue;

    const pct = item.staartPercentage ?? 0;

    // ── Legacy staart types (backward compatibility) ──
    if (item.rowType === 'staart_ukk') {
      item.quantity = pct;
      item.unit = '%';
      item.unitPrice = totaalKolommen / 100;
      item.total = totaalKolommen * (pct / 100);
      runningTotal = totaalKolommen + item.total;
      kostprijs = runningTotal;
    } else if (item.rowType === 'staart_ak') {
      const base = runningTotal;
      item.quantity = pct;
      item.unit = '%';
      item.unitPrice = base / 100;
      item.total = base * (pct / 100);
      runningTotal += item.total;
      kostprijs = runningTotal;
    } else if (item.rowType === 'staart_wr') {
      const base = runningTotal;
      item.quantity = pct;
      item.unit = '%';
      item.unitPrice = base / 100;
      item.total = base * (pct / 100);
      runningTotal += item.total;

    // ── Bouw 1 staart model ──
    // Phase 1: over totaal kolommen (raw directe kosten)
    } else if (item.rowType === 'staart_ak_oa') {
      // AK over onderaanneming: percentage over only the OA portion
      item.quantity = pct;
      item.unit = '%';
      item.unitPrice = oaPortie / 100;
      item.total = oaPortie * (pct / 100);
      kostprijs = totaalKolommen + item.total;
      runningTotal = kostprijs;
    } else if (item.rowType === 'staart_abk') {
      // Algemene bedrijfskosten: percentage over totaal kolommen
      item.quantity = pct;
      item.unit = '%';
      item.unitPrice = totaalKolommen / 100;
      item.total = totaalKolommen * (pct / 100);
      kostprijs += item.total;
      runningTotal = kostprijs;
    } else if (item.rowType === 'staart_garanties') {
      // Garanties: percentage over totaal kolommen
      item.quantity = pct;
      item.unit = '%';
      item.unitPrice = totaalKolommen / 100;
      item.total = totaalKolommen * (pct / 100);
      kostprijs += item.total;
      runningTotal = kostprijs;
    } else if (item.rowType === 'staart_wvpm') {
      // Werkvoorbereiding & PM: percentage over totaal kolommen
      item.quantity = pct;
      item.unit = '%';
      item.unitPrice = totaalKolommen / 100;
      item.total = totaalKolommen * (pct / 100);
      kostprijs += item.total;
      runningTotal = kostprijs;

    // Phase 2: over kostprijs (= totaal kolommen + phase 1 surcharges)
    } else if (item.rowType === 'staart_risico') {
      item.quantity = pct;
      item.unit = '%';
      item.unitPrice = kostprijs / 100;
      item.total = kostprijs * (pct / 100);
      runningTotal += item.total;
    } else if (item.rowType === 'staart_winst') {
      item.quantity = pct;
      item.unit = '%';
      item.unitPrice = kostprijs / 100;
      item.total = kostprijs * (pct / 100);
      runningTotal += item.total;
    } else if (item.rowType === 'staart_verzekering') {
      item.quantity = pct;
      item.unit = '%';
      item.unitPrice = kostprijs / 100;
      item.total = kostprijs * (pct / 100);
      runningTotal += item.total;

    // Phase 3: BTW over aanneemsom (= kostprijs + risico + winst + verzekering)
    } else if (item.rowType === 'staart_btw') {
      // runningTotal at this point = aanneemsom excl BTW
      const aanneemsomExcl = runningTotal;
      item.quantity = pct;
      item.unit = '%';
      item.unitPrice = aanneemsomExcl / 100;
      item.total = aanneemsomExcl * (pct / 100);
      runningTotal += item.total;

    // ── Afronding (shared between legacy and Bouw 1) ──
    } else if (item.rowType === 'staart_afronding') {
      const rounded = Math.round(runningTotal / 10) * 10;
      item.total = rounded - runningTotal;
      item.quantity = null;
      item.unitPrice = 0;
      runningTotal = rounded;
    }
  }

  // Fourth pass: compute hierarchical Nr values
  const siblingGroups = new Map<string | null, CostItem[]>();
  for (const item of result) {
    const key = item.parentId;
    const list = siblingGroups.get(key) ?? [];
    list.push(item);
    siblingGroups.set(key, list);
  }

  function assignNr(parentId: string | null, parentNr: string) {
    const siblings = siblingGroups.get(parentId) ?? [];
    let counter = 0;
    for (const item of siblings) {
      // Staart, tekstregel, and witregel rows don't get hierarchical numbers
      if (isStagartRowType(item.rowType) || item.rowType === 'tekstregel' || item.rowType === 'witregel') {
        item.nr = '';
        continue;
      }
      counter++;
      // Top-level chapters: use their code as Nr when available (e.g. "60" instead of "19")
      let segment: string;
      if (!parentId && item.rowType === 'chapter' && item.code) {
        segment = item.code;
      } else {
        segment = String(counter).padStart(2, '0');
      }
      item.nr = parentNr ? `${parentNr}.${segment}` : segment;
      // Recurse into children if this is a container
      if (item.rowType === 'chapter' || item.rowType === 'begrotingspost' || item.rowType === 'bewakingspost') {
        assignNr(item.id, item.nr);
      }
    }
  }
  assignNr(null, '');

  // Add live staart breakdowns (replaces stale schedule.staartRows cache)
  return computeStaartItemBreakdowns(result);
}

export interface KostprijsBreakdown {
  loon: number;
  materiaal: number;
  materieel: number;
  stelpost: number;
  onderaanneming: number;
}

/** Group regel totals by resourceType to produce kostprijs columns
 *  (loon, materiaal, materieel, stelpost, onderaanneming).
 *
 *  Splits a regel with a separate laborPrice into a loon part and a
 *  resource-column part, when the split matches the row's total. */
export function computeKostprijsBreakdown(items: CostItem[]): KostprijsBreakdown {
  const out: KostprijsBreakdown = {
    loon: 0, materiaal: 0, materieel: 0, stelpost: 0, onderaanneming: 0,
  };
  for (const item of items) {
    if (item.rowType !== 'regel') continue;
    const qty = item.quantity ?? 0;
    const lab = item.laborPrice ?? 0;
    const matPrice = item.normUnitPrice ?? 0;
    const total = item.total ?? 0;

    if (item.resourceType === 'onderaannemer') {
      out.onderaanneming += total;
      continue;
    }

    const splitLoon = lab * qty;
    const splitMat = matPrice * qty;
    const usedSplit = Math.abs(splitLoon + splitMat - total) < 0.01 && (splitLoon + splitMat) > 0;
    const loonAmt = usedSplit ? splitLoon : 0;
    const matAmt = usedSplit ? splitMat : total;

    out.loon += loonAmt;

    switch (item.resourceType) {
      case 'arbeid':
        // 'arbeid' regel: total goes to loon (in addition to any split-derived loon)
        out.loon += matAmt;
        break;
      case 'materieel':
        out.materieel += matAmt;
        break;
      case 'overig':
        out.stelpost += matAmt;
        break;
      case 'materiaal':
      default:
        out.materiaal += matAmt;
        break;
    }
  }
  return out;
}

/** Returns items with staart_* rows updated to have staartItemBreakdown filled in.
 *  Pure: returns new array, leaves input untouched (except non-staart items are passed through). */
export function computeStaartItemBreakdowns(items: CostItem[]): CostItem[] {
  const kostprijs = computeKostprijsBreakdown(items);
  const totaalKolommen =
    kostprijs.loon + kostprijs.materiaal + kostprijs.materieel +
    kostprijs.stelpost + kostprijs.onderaanneming;

  // Track running cumulative — starts with kostprijs.
  let cumulative = totaalKolommen;
  // Resource-column running totals also accumulate
  const running = { ...kostprijs };

  // Order matters: process in array order (which is sortOrder order).
  return items.map((item) => {
    if (!item.rowType?.startsWith('staart_')) return item;
    const pct = (item.staartPercentage ?? 0) / 100;
    // Vlakke staart (BasCalc): percentage over de directe kosten i.p.v.
    // over het opgehoogde bedrag (cascade). Zie CostItem.staartBasis.
    const vlak = item.staartBasis === 'kostprijs';

    let bd: import('@/types/costModel').StaartItemBreakdown = {
      loon: 0, materiaal: 0, materieel: 0, stelpost: 0, onderaanneming: 0,
      bedrag: 0, subtotaal: 0, totaal: cumulative,
    };

    switch (item.rowType) {
      case 'staart_ak_oa': {
        const v = running.onderaanneming * pct;
        bd = { ...bd, onderaanneming: v, subtotaal: v };
        running.onderaanneming += v;
        cumulative += v;
        bd.totaal = cumulative;
        break;
      }
      case 'staart_abk':
      case 'staart_garanties':
      case 'staart_wvpm': {
        // Vlak: over de oorspronkelijke kostprijskolommen; cascade: over de
        // running (door eerdere opslagen opgehoogde) kolommen.
        const bLoon = vlak ? kostprijs.loon : running.loon;
        const bMat = vlak ? kostprijs.materiaal : running.materiaal;
        const bMatrl = vlak ? kostprijs.materieel : running.materieel;
        const base = bLoon + bMat + bMatrl;
        const loon = bLoon * pct;
        const mat = bMat * pct;
        const matrl = bMatrl * pct;
        const v = loon + mat + matrl;
        bd = { ...bd, loon, materiaal: mat, materieel: matrl, bedrag: base, subtotaal: v };
        if (!vlak) {
          running.loon += loon;
          running.materiaal += mat;
          running.materieel += matrl;
        }
        cumulative += v;
        bd.totaal = cumulative;
        break;
      }
      case 'staart_risico':
      case 'staart_winst':
      case 'staart_verzekering': {
        const base = vlak ? totaalKolommen : cumulative;
        const v = base * pct;
        bd = { ...bd, bedrag: base, subtotaal: v };
        cumulative += v;
        bd.totaal = cumulative;
        break;
      }
      case 'staart_btw': {
        const base = cumulative;
        const v = base * pct;
        bd = { ...bd, bedrag: base, subtotaal: v };
        cumulative += v;
        bd.totaal = cumulative;
        break;
      }
      case 'staart_afronding': {
        if (item.staartVastBedrag != null) {
          // Handmatig in het grid ingevulde afronding: vast bedrag.
          bd = { ...bd, subtotaal: item.staartVastBedrag };
          cumulative += item.staartVastBedrag;
        } else if (item.staartDoelbedrag != null) {
          // Vaste sluitpost (BasCalc): afronding = doelbedrag − som tot hier.
          const v = item.staartDoelbedrag - cumulative;
          bd = { ...bd, subtotaal: v };
          cumulative = item.staartDoelbedrag;
        } else {
          const rounded = Math.round(cumulative * 100) / 100;
          const v = rounded - cumulative;
          bd = { ...bd, subtotaal: v };
          cumulative = rounded;
        }
        bd.totaal = cumulative;
        break;
      }
      // Legacy staart_ukk/ak/wr — percentage-of-cumulative (of vlak over kostprijs)
      case 'staart_ukk':
      case 'staart_ak':
      case 'staart_wr': {
        const base = vlak ? totaalKolommen : cumulative;
        const v = base * pct;
        bd = { ...bd, bedrag: base, subtotaal: v };
        cumulative += v;
        bd.totaal = cumulative;
        break;
      }
    }

    return { ...item, staartItemBreakdown: bd, total: bd.subtotaal };
  });
}

/** Sum of all top-level items (including staartkosten) = aanneemsom */
export function getGrandTotal(items: CostItem[]): number {
  return getStaartBreakdown(items).aanneemsomAfgerond;
}

/** Sum of only non-staart top-level items = kostprijs (directe kosten) */
export function getKostprijs(items: CostItem[]): number {
  return items
    .filter(item => item.parentId === null && !isStagartRowType(item.rowType))
    .reduce((sum, item) => sum + item.total, 0);
}

/** Get the aanneemsom breakdown for display purposes */
export interface StaartBreakdown {
  // Legacy fields (backward compatible)
  kostprijs: number;
  ukkAmount: number;
  ukkPercentage: number;
  subtotaal1: number;
  akAmount: number;
  akPercentage: number;
  subtotaal2: number;
  wrAmount: number;
  wrPercentage: number;
  aanneemsom: number;
  afronding: number;
  aanneemsomAfgerond: number;
  // Bouw 1 model fields
  totaalKolommen: number;
  akOaAmount: number;
  akOaPercentage: number;
  abkAmount: number;
  abkPercentage: number;
  garantiesAmount: number;
  garantiesPercentage: number;
  wvpmAmount: number;
  wvpmPercentage: number;
  kostprijsBouw1: number;       // totaalKolommen + ak_oa + abk + garanties + wvpm (Bouw 1 staart model)
  risicoAmount: number;
  risicoPercentage: number;
  winstAmount: number;
  winstPercentage: number;
  verzekeringAmount: number;
  verzekeringPercentage: number;
  aanneemsomExcl: number;        // kostprijsBouw1 + risico + winst + verzekering
  btwAmount: number;
  btwPercentage: number;
}

export function getStaartBreakdown(items: CostItem[]): StaartBreakdown {
  const totaalKolommen = getKostprijs(items);
  // Legacy fields
  let ukkAmount = 0, ukkPercentage = 0;
  let akAmount = 0, akPercentage = 0;
  let wrAmount = 0, wrPercentage = 0;
  let afronding = 0;
  // Bouw 1 fields
  let akOaAmount = 0, akOaPercentage = 0;
  let abkAmount = 0, abkPercentage = 0;
  let garantiesAmount = 0, garantiesPercentage = 0;
  let wvpmAmount = 0, wvpmPercentage = 0;
  let risicoAmount = 0, risicoPercentage = 0;
  let winstAmount = 0, winstPercentage = 0;
  let verzekeringAmount = 0, verzekeringPercentage = 0;
  let btwAmount = 0, btwPercentage = 0;

  for (const item of items) {
    if (item.rowType === 'staart_ukk') { ukkAmount = item.total; ukkPercentage = item.staartPercentage ?? 0; }
    if (item.rowType === 'staart_ak') { akAmount = item.total; akPercentage = item.staartPercentage ?? 0; }
    if (item.rowType === 'staart_wr') { wrAmount = item.total; wrPercentage = item.staartPercentage ?? 0; }
    if (item.rowType === 'staart_ak_oa') { akOaAmount = item.total; akOaPercentage = item.staartPercentage ?? 0; }
    if (item.rowType === 'staart_abk') { abkAmount = item.total; abkPercentage = item.staartPercentage ?? 0; }
    if (item.rowType === 'staart_garanties') { garantiesAmount = item.total; garantiesPercentage = item.staartPercentage ?? 0; }
    if (item.rowType === 'staart_wvpm') { wvpmAmount = item.total; wvpmPercentage = item.staartPercentage ?? 0; }
    if (item.rowType === 'staart_risico') { risicoAmount = item.total; risicoPercentage = item.staartPercentage ?? 0; }
    if (item.rowType === 'staart_winst') { winstAmount = item.total; winstPercentage = item.staartPercentage ?? 0; }
    if (item.rowType === 'staart_verzekering') { verzekeringAmount = item.total; verzekeringPercentage = item.staartPercentage ?? 0; }
    if (item.rowType === 'staart_btw') { btwAmount = item.total; btwPercentage = item.staartPercentage ?? 0; }
    if (item.rowType === 'staart_afronding') { afronding = item.total; }
  }

  // Legacy cascade
  const subtotaal1 = totaalKolommen + ukkAmount;
  const subtotaal2 = subtotaal1 + akAmount;

  // Bouw 1 cascade
  const kostprijsBouw1 = totaalKolommen + akOaAmount + abkAmount + garantiesAmount + wvpmAmount;
  const aanneemsomExcl = kostprijsBouw1 + risicoAmount + winstAmount + verzekeringAmount;

  // Combined: use whichever model is active (legacy or Bouw 1)
  // Legacy aanneemsom = subtotaal2 + wrAmount, Bouw 1 = aanneemsomExcl
  const aanneemsom = subtotaal2 + wrAmount + akOaAmount + abkAmount + garantiesAmount + wvpmAmount + risicoAmount + winstAmount + verzekeringAmount;
  const aanneemsomAfgerond = aanneemsom + btwAmount + afronding;

  return {
    kostprijs: totaalKolommen, totaalKolommen,
    ukkAmount, ukkPercentage, subtotaal1, akAmount, akPercentage, subtotaal2,
    wrAmount, wrPercentage,
    aanneemsom, afronding, aanneemsomAfgerond,
    akOaAmount, akOaPercentage, abkAmount, abkPercentage,
    garantiesAmount, garantiesPercentage, wvpmAmount, wvpmPercentage,
    kostprijsBouw1, risicoAmount, risicoPercentage,
    winstAmount, winstPercentage, verzekeringAmount, verzekeringPercentage,
    aanneemsomExcl, btwAmount, btwPercentage,
  };
}
