import type { CostItem, CostSchedule, CostUnit, CompanyInfo } from '@/types/costModel';

function generateId(): string {
  return crypto.randomUUID();
}

function generateIfcGuid(): string {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';
  let r = '';
  for (let i = 0; i < 22; i++) r += chars[Math.floor(Math.random() * 64)];
  return r;
}

function mapUnit(raw: string): CostUnit {
  const u = raw.trim().toLowerCase();
  switch (u) {
    case 'm': return 'm';
    case 'm1': return 'm';
    case 'm2': return 'm²';
    case 'm3': return 'm³';
    case 'kg': return 'kg';
    case 'ton': return 'ton';
    case 'uur': return 'uur';
    case 'st': return 'st';
    case 'dgn': return 'dgn';
    case 'km': return 'km';
    case 'keer': return 'keer';
    case 'ls': return 'ls';
    case 'week': return 'week';
    case 'mnd': return 'mnd';
    case 'post': return 'post';
    case '%': return '%';
    case 'pm': return 'pm';
    case 'eur': return 'post';
    default: return 'st';
  }
}

function createEmptyItem(overrides: Partial<CostItem>): CostItem {
  return {
    id: generateId(),
    parentId: null,
    sortOrder: 0,
    code: '',
    description: '',
    unit: 'st',
    quantity: null,
    materialPrice: null,
    laborPrice: null,
    unitPrice: 0,
    total: 0,
    isCollapsed: false,
    depth: 0,
    notes: '',
    ifcGuid: generateIfcGuid(),
    rowType: 'begrotingspost',
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
    ...overrides,
  };
}

/** Get text content of the first matching element */
function getText(el: Element, tagName: string): string {
  const found = el.getElementsByTagName(tagName)[0];
  return found?.textContent?.trim() ?? '';
}

/** Get numeric content of the first matching element */
function getNum(el: Element, tagName: string): number | null {
  const text = getText(el, tagName);
  if (!text) return null;
  const n = Number(text);
  return isNaN(n) ? null : n;
}

/** Determine chapter depth from tussenhoofd number */
function getChapterDepth(nr: string): number {
  // RSX tussenhoofd numbering: 1-9 = depth 0, 1000-9999 = depth 1, etc.
  const n = parseInt(nr, 10);
  if (isNaN(n)) return 0;
  if (n < 10) return 0;
  if (n < 100) return 1;
  if (n < 10000) return 1;
  return 2;
}

/** Collect all text from hoofdcode sections for a detailed description */
function getFullDescription(bpost: Element): string {
  const parts: string[] = [];

  // romptekst = short description
  const romp = getText(bpost, 'romptekst');
  if (romp) parts.push(romp);

  // hoofdcode.hoofdtekst → longer description
  const hoofdtekst = bpost.getElementsByTagName('hoofdcode.hoofdtekst')[0];
  if (hoofdtekst) {
    const ht = hoofdtekst.textContent?.trim() ?? '';
    if (ht && ht !== romp) parts.push(ht);
  }

  return parts[0] ?? '';
}

/** Collect detailed notes from hoofdcode.tekstblok */
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

export function importRsxFile(text: string): { schedule: CostSchedule; items: CostItem[]; companyInfo: CompanyInfo } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'application/xml');

  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error('Ongeldig RSX-bestand: XML parse error');
  }

  // --- Extract project info from raw.contractinfo ---
  const contractInfo = doc.getElementsByTagName('raw.contractinfo')[0];
  const bestekNr = contractInfo ? getText(contractInfo, 'raw.bestek.nr') : '';
  const bestekOmschrijving = contractInfo ? getText(contractInfo, 'raw.bestek.omschrijving') : '';

  const companyInfo: CompanyInfo = {
    name: '',
    postalAddress: '',
    postalCity: '',
    visitAddress: '',
    visitCity: '',
    phone: '',
    fax: '',
    email: '',
    logoLeft: '',
    logoRight: '',
  };

  // --- Parse besteksposten from dl22.vsub.compleet ---
  const items: CostItem[] = [];
  let sortOrder = 0;

  // Track chapter hierarchy
  const chapterStack: { id: string; depth: number; nr: string }[] = [];

  // Find all dl22.vsub.compleet sections (staat van resultaatsverplichtingen)
  const vsubSections = doc.getElementsByTagName('dl22.vsub.compleet');

  for (let s = 0; s < vsubSections.length; s++) {
    const vsub = vsubSections[s];

    // Process all direct children in order
    for (let c = 0; c < vsub.children.length; c++) {
      const child = vsub.children[c];
      const tagName = child.tagName;

      if (tagName === 'dl22.bpost.tussenhoofd') {
        // Chapter / tussenhoofd
        const nr = getText(child, 'dl22.bpost.tussenhoofdnr');
        const description = getText(child, 'romptekst');
        const depth = getChapterDepth(nr);

        // Pop chapters at same or deeper depth
        while (chapterStack.length > 0 && chapterStack[chapterStack.length - 1].depth >= depth) {
          chapterStack.pop();
        }

        const parentId = chapterStack.length > 0 ? chapterStack[chapterStack.length - 1].id : null;

        const item = createEmptyItem({
          parentId,
          sortOrder: sortOrder++,
          code: nr,
          description,
          depth,
          rowType: 'chapter',
          unit: 'st',
          verrekenbaar: 'V',
        });

        items.push(item);
        chapterStack.push({ id: item.id, depth, nr });

      } else if (tagName === 'dl22.resultaatsverpl') {
        // Resultaatsverplichting block — contains one or more besteksposten
        const parentChapterId = chapterStack.length > 0 ? chapterStack[chapterStack.length - 1].id : null;
        const parentDepth = chapterStack.length > 0 ? chapterStack[chapterStack.length - 1].depth + 1 : 0;

        // Process child bpost elements
        for (let b = 0; b < child.children.length; b++) {
          const bpost = child.children[b];
          const bpostTag = bpost.tagName;

          if (bpostTag === 'dl22.bpost.6cijfer.0' || bpostTag === 'dl22.bpost.6cijfer.volg') {
            // Extract post number
            const postNr = getText(bpost, 'dl22.bpost.nr6.0') || getText(bpost, 'dl22.bpost.nr6.volg');
            const description = getFullDescription(bpost);
            const notes = getNotes(bpost);

            // Unit
            const unitEl = bpost.getElementsByTagName('dl22.eenheid.res.verpl')[0];
            const unitText = unitEl?.textContent?.trim() ?? '';
            const unit = unitText ? mapUnit(unitText) : 'st';

            // Quantity (from res.verpl or ter.inl)
            const qtyRes = getNum(bpost, 'dl22.hoev.res.verpl');
            const qtyInl = getNum(bpost, 'dl22.hoev.ter.inl');
            const quantity = qtyRes ?? qtyInl;

            // Quantity type (V=verrekenbaar, N=niet verrekenbaar, I=ter inlichting)
            const qtyEl = bpost.getElementsByTagName('dl22.hoev.res.verpl')[0]
              || bpost.getElementsByTagName('dl22.hoev.ter.inl')[0];
            const qtyKenmerk = qtyEl?.getAttribute('kenmerk') ?? '';

            const item = createEmptyItem({
              parentId: parentChapterId,
              sortOrder: sortOrder++,
              code: postNr,
              description,
              unit,
              quantity,
              depth: parentDepth,
              rowType: 'begrotingspost',
              notes: [
                qtyKenmerk ? `Hoeveelheid: ${qtyKenmerk === 'V' ? 'Verrekenbaar' : qtyKenmerk === 'N' ? 'Niet verrekenbaar' : 'Ter inlichting'}` : '',
                notes,
              ].filter(Boolean).join('\n'),
            });

            items.push(item);

            // Import tekstblok alinea's as witregels under the bestekspost
            const blocks = bpost.getElementsByTagName('hoofdcode.tekstblok');
            for (let tb = 0; tb < blocks.length; tb++) {
              const alineas = blocks[tb].getElementsByTagName('alinea.hoofdcode');
              const witText: string[] = [];
              for (let a = 0; a < alineas.length; a++) {
                const t = alineas[a].textContent?.trim();
                if (t) witText.push(t);
              }
              if (witText.length > 0) {
                const witItem = createEmptyItem({
                  parentId: item.id,
                  sortOrder: sortOrder++,
                  description: witText.join('\n'),
                  depth: parentDepth + 1,
                  rowType: 'witregel',
                });
                items.push(witItem);
              }
            }
          }
        }
      }
    }
  }

  // --- Build schedule ---
  const schedule: CostSchedule = {
    id: generateId(),
    name: bestekOmschrijving || `RSX Import ${bestekNr}`,
    description: `Bestek ${bestekNr}`,
    status: 'DRAFT',
    predefinedType: 'ESTIMATE',
    currency: 'EUR',
    projectName: bestekOmschrijving || '',
    projectNumber: bestekNr || '',
    client: '',
    author: '',
    ifcGuid: generateIfcGuid(),
    uitvoeringskosten: 6,
    algemeneKosten: 9,
    winstRisico: 5,
  };

  return { schedule, items, companyInfo };
}
