import * as XLSX from 'xlsx';
import type { CostItem, CostSchedule, RowType, CompanyInfo, ResourceType } from '@/types/costModel';
import { makeCostItem, normalizeUnit, genId, genIfcGuid } from './core';

function getDepthFromCode(code: string): number {
  const len = code.replace(/\s/g, '').length;
  if (len <= 1) return 0;
  if (len <= 2) return 1;
  if (len <= 3) return 2;
  return 3; // 6-char bestekspost
}

function getRowType(code: string): RowType {
  const c = code.replace(/\s/g, '');
  switch (c) {
    case '929990': return 'staart_ukk';
    case '939990': return 'staart_ak';
    case '949990': return 'staart_wr';
    case '959990': return 'staart_afronding';
    default: return 'begrotingspost';
  }
}

/** Map S-code to ResourceType */
function mapResourceType(sColumn: string): ResourceType {
  const s = sColumn.toLowerCase();
  if (s === 'm') return 'arbeid'; // mankracht = arbeid
  if (s === 'h') return 'materieel'; // hulpmiddel = materieel
  return 'overig';
}

function cellStr(row: unknown[], col: number): string {
  const v = row[col];
  if (v === undefined || v === null) return '';
  return String(v).trim();
}

function cellNum(row: unknown[], col: number): number | null {
  const v = row[col];
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

export function importBasCalcFile(arrayBuffer: ArrayBuffer): { schedule: CostSchedule; items: CostItem[]; companyInfo: CompanyInfo } {
  const wb = XLSX.read(arrayBuffer, { type: 'array' });

  // --- Read Menu sheet for project info and company data ---
  let projectName = '';
  let projectNumber = '';
  let client = '';
  let author = '';
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
  const menuSheet = wb.Sheets['Menu'];
  if (menuSheet) {
    const menuData: unknown[][] = XLSX.utils.sheet_to_json(menuSheet, { header: 1 });
    for (const row of menuData) {
      if (!row || row.length < 5) continue;
      const label4 = String(row[4] ?? '').trim().toLowerCase();
      if (label4.startsWith('project') || label4.startsWith('werk')) {
        if (!projectName) projectName = cellStr(row, 5);
        const label8 = String(row[8] ?? '').trim().toLowerCase();
        if (label8.startsWith('werknummer') || label8.startsWith('project')) {
          projectNumber = cellStr(row, 9);
        }
      }
      if (label4.startsWith('opdrachtgever') || label4.startsWith('klant')) {
        client = cellStr(row, 5);
      }
      if (label4.startsWith('bedrijf')) {
        author = cellStr(row, 5);
      }
    }

    if (menuData.length > 13) companyInfo.name = cellStr(menuData[13] ?? [], 5);
    if (menuData.length > 14) companyInfo.postalAddress = cellStr(menuData[14] ?? [], 5);
    if (menuData.length > 15) companyInfo.postalCity = cellStr(menuData[15] ?? [], 5);
    if (menuData.length > 16) companyInfo.visitAddress = cellStr(menuData[16] ?? [], 5);
    if (menuData.length > 17) companyInfo.visitCity = cellStr(menuData[17] ?? [], 5);
    if (menuData.length > 18) companyInfo.phone = cellStr(menuData[18] ?? [], 5);
    if (menuData.length > 19) companyInfo.fax = cellStr(menuData[19] ?? [], 5);
    if (menuData.length > 20) companyInfo.email = cellStr(menuData[20] ?? [], 5);
  }

  // --- Read Eindblad for staartkosten percentages + aanneemsom-doel ---
  let uitvoeringskosten = 6;
  let algemeneKosten = 9;
  let winstRisico = 5;
  // BasCalc sluit de begroting met een vaste afrondingspost op een exact
  // doelbedrag (de aanneemsom op het Eindblad, bv. 75.000). Dat doel nemen
  // we over zodat de afronding in OCS identiek sluit.
  let aanneemsomDoel: number | null = null;
  const eindSheet = wb.Sheets['Eindblad'];
  if (eindSheet) {
    const eindData: unknown[][] = XLSX.utils.sheet_to_json(eindSheet, { header: 1 });
    for (const row of eindData) {
      if (!row) continue;
      // Aanneemsom-doel: cel 'Tot_Inschrijfstaat' met het bedrag ernaast.
      for (let c = 0; c < row.length; c++) {
        if (String(row[c] ?? '').trim() === 'Tot_Inschrijfstaat') {
          for (let n = c + 1; n < row.length; n++) {
            const v = cellNum(row, n);
            if (v !== null && v !== 0) { aanneemsomDoel = v; break; }
          }
        }
      }
      if (row.length < 16) continue;
      const code = String(row[8] ?? '').trim();
      const pct = cellNum(row, 15);
      if (pct === null) continue;
      if (code === '929990') uitvoeringskosten = pct;
      else if (code === '939990') algemeneKosten = pct;
      else if (code === '949990') winstRisico = pct;
    }
  }

  // --- Read Kostprijs sheet ---
  const kostprijsSheet = wb.Sheets['Kostprijs'];
  if (!kostprijsSheet) {
    throw new Error('Geen "Kostprijs" tabblad gevonden in het BasCalc bestand');
  }

  const data: unknown[][] = XLSX.utils.sheet_to_json(kostprijsSheet, { header: 1 });

  const items: CostItem[] = [];
  let sortOrder = 0;

  // Track parent hierarchy by depth
  const parentStack: { id: string; depth: number }[] = [];

  // Collect all rows.
  // 'cp' (afsluiting calculatieblok, hv-factor) wordt overgeslagen: de
  // hv-factor zit al verwerkt in de cn-bedragen (kolom N) en een cp-rij als
  // regel importeren gaf lege phantom-regels.
  const rowEntries: { type: string; row: unknown[] }[] = [];
  for (const row of data) {
    if (!row || row.length === 0) continue;
    const rijtype = cellStr(row, 0); // Column A
    if (rijtype === 'ih' || rijtype === 'cn' || rijtype === 'cb' || rijtype === 'opm') {
      rowEntries.push({ type: rijtype, row });
    }
  }

  // Binnen een staart-blok (929990 e.d.) dragen cb/cn-rijen geen echte
  // calculatie — het percentage staat op de ih-rij zelf. Kinderen daarvan
  // overslaan i.p.v. als phantom-bewakingspost/-regels importeren.
  let inStaartBlock = false;

  /**
   * Wat onze calculator van een regel met deze velden zou maken
   * (spiegel van recalculateItems: lab=0 → norm>0 ? qty×norm/cap×prijs
   * : qty×prijs). Gebruikt om te toetsen of de norm-mapping het
   * Excel-bedrag exact reproduceert.
   */
  const calcCandidate = (qty: number | null, normQ: number | null, normF: number | null, nup: number | null): number => {
    const q = qty ?? 0;
    const n = normQ ?? 0;
    const p = nup ?? 0;
    if (n === 0) return q * p;
    return (q * n / ((normF ?? 1) || 1)) * p;
  };

  for (let idx = 0; idx < rowEntries.length; idx++) {
    const entry = rowEntries[idx];

    if (entry.type === 'ih') {
      const row = entry.row;
      const code = cellStr(row, 2);     // Column C
      if (!code) continue;

      const description = cellStr(row, 3); // Column D
      const quantity = cellNum(row, 8);    // Column I (Hoeveelheid)
      const unit = normalizeUnit(cellStr(row, 9)); // Column J (Eenheid)
      const ehPrijs = cellNum(row, 12);    // Column M (Eh.prijs post)
      const bedrag = cellNum(row, 13);     // Column N (Bedrag post)

      const depth = getDepthFromCode(code);
      const rowType = getRowType(code);

      // Determine if this is a chapter based on code length
      const isChapter = depth < 3;

      // Find parent
      while (parentStack.length > 0 && parentStack[parentStack.length - 1].depth >= depth) {
        parentStack.pop();
      }
      const parentId = parentStack.length > 0 ? parentStack[parentStack.length - 1].id : null;

      // Determine material vs labor from the 'S' column (K, index 10)
      let materialPrice: number | null = null;
      let laborPrice: number | null = null;

      if (!isChapter && ehPrijs !== null) {
        const sColumn = cellStr(row, 10).toLowerCase();
        if (sColumn === 'h') {
          laborPrice = ehPrijs;
        } else if (sColumn === 'm') {
          materialPrice = ehPrijs;
        } else {
          materialPrice = ehPrijs;
        }
      }

      // For staartkosten rows, extract percentage
      let staartPercentage: number | null = null;
      if (rowType !== 'begrotingspost') {
        staartPercentage = cellNum(row, 8) ?? cellNum(row, 5);
      }

      const unitPrice = (materialPrice ?? 0) + (laborPrice ?? 0);
      const total = bedrag ?? (quantity !== null ? quantity * unitPrice : 0);

      const itemRowType: RowType = isChapter ? 'chapter' : rowType;
      inStaartBlock = !isChapter && rowType !== 'begrotingspost';

      // Bron-getrouw: als een kale post (zonder middelen) bij herberekening
      // (quantity × prijs) niet op het Excel-bedrag (kolom N) uitkomt, pin
      // dan de prijs zodat het bedrag exact behouden blijft. Posten mét
      // cn-kinderen worden bottom-up overschreven door de (gepinde) regels.
      let pinQuantity = quantity;
      let pinMaterial = materialPrice;
      let pinLabor = laborPrice;
      if (!isChapter && rowType === 'begrotingspost' && total !== 0) {
        const zouWorden = (quantity ?? 0) * unitPrice;
        if (Math.abs(zouWorden - total) > 0.005) {
          pinQuantity = quantity && quantity !== 0 ? quantity : 1;
          // Niet afronden: hoeveelheid × prijs = exact het bronbedrag.
          pinMaterial = total / pinQuantity;
          pinLabor = null;
        }
      }

      // BasCalc rekent de staart vlak: elk percentage over de kostprijs
      // (niet cascade), en de afronding sluit op het Eindblad-doelbedrag.
      const isStaartPct = rowType === 'staart_ukk' || rowType === 'staart_ak' || rowType === 'staart_wr';
      const item = makeCostItem({
        parentId,
        sortOrder: sortOrder++,
        code,
        description,
        unit: isChapter ? 'st' : unit,
        quantity: isChapter ? null : pinQuantity,
        materialPrice: isChapter ? null : pinMaterial,
        laborPrice: isChapter ? null : pinLabor,
        unitPrice: isChapter ? 0 : (pinMaterial ?? 0) + (pinLabor ?? 0),
        total,
        depth,
        rowType: itemRowType,
        staartPercentage,
        staartBasis: isStaartPct ? 'kostprijs' : null,
        staartDoelbedrag: rowType === 'staart_afronding' ? aanneemsomDoel : null,
        verrekenbaar: isChapter ? 'V' : null,
      });

      items.push(item);

      // Push to parent stack if it's a container (chapter or begrotingspost)
      // so that cb/cn rows become children of the begrotingspost, not the chapter
      parentStack.push({ id: item.id, depth });
    } else if (inStaartBlock) {
      // cb/cn/opm binnen een staart-blok: overslaan (geen echte calculatie).
      continue;
    } else if (entry.type === 'cb') {
      const row = entry.row;
      const code = cellStr(row, 2);
      const description = cellStr(row, 3);
      const bedrag = cellNum(row, 13);

      const parentId = parentStack.length > 0 ? parentStack[parentStack.length - 1].id : null;
      const depth = parentId ? (parentStack[parentStack.length - 1].depth + 1) : 0;

      // cb rows with code 'opm' are tekstregel (opmerking), not bewakingspost
      const isTekst = code.trim().toLowerCase() === 'opm';

      const item = makeCostItem({
        parentId,
        sortOrder: sortOrder++,
        code: isTekst ? '' : code,
        description,
        total: isTekst ? 0 : (bedrag ?? 0),
        depth,
        rowType: isTekst ? 'tekstregel' : 'bewakingspost',
      });

      items.push(item);
      // Only bewakingspost can be parent of cn rows
      if (!isTekst) {
        parentStack.push({ id: item.id, depth });
      }
    } else if (entry.type === 'cn') {
      // Regel → own CostItem row with norm fields
      const row = entry.row;
      const code = cellStr(row, 2);
      const description = cellStr(row, 3);
      const colE = cellNum(row, 4);     // Column E → Aantal
      const colF = cellNum(row, 5);     // Column F → Norm
      const colH = cellNum(row, 7);     // Column H → hv-post (capaciteit/deler)
      const colI = cellNum(row, 8);     // Column I → Hoeveelheid (berekend)
      const rUnit = normalizeUnit(cellStr(row, 9));
      const sColumn = cellStr(row, 10);
      const colL = cellNum(row, 11);    // Column L → Prijs middel
      const colM = cellNum(row, 12);    // Column M → Eh.prijs post
      const rBedrag = cellNum(row, 13); // Column N → Bedrag (bron van waarheid)

      const resourceType = mapResourceType(sColumn);

      // Find parent: most recent bewakingspost or ih item
      const parentId = parentStack.length > 0 ? parentStack[parentStack.length - 1].id : null;
      const depth = parentId ? (parentStack[parentStack.length - 1].depth + 1) : 0;

      // Bron-getrouwe velden: kolom N is het bedrag zoals Excel het toont.
      // Houd de norm-detailvelden alleen aan als onze regelformule er exact
      // hetzelfde bedrag uit herrekent (anders zou elke herberekening de
      // totalen laten wegdrijven). Probeer eerst prijs-middel (L), dan
      // eh.prijs (M); reproduceert geen van beide het bedrag → pin het
      // bedrag via hoeveelheid × effectieve prijs.
      const doel = rBedrag ?? 0;
      let fields: { quantity: number | null; normQuantity: number | null; normFactor: number | null; normUnitPrice: number | null };
      if (Math.abs(calcCandidate(colE, colF, colH, colL) - doel) <= 0.005) {
        fields = { quantity: colE, normQuantity: colF, normFactor: colH, normUnitPrice: colL };
      } else if (Math.abs(calcCandidate(colE, colF, colH, colM) - doel) <= 0.005) {
        fields = { quantity: colE, normQuantity: colF, normFactor: colH, normUnitPrice: colM };
      } else {
        const q = (colI ?? colE) || 1;
        // Prijs niet afronden: hoeveelheid × prijs moet exact het
        // bronbedrag opleveren, ook na elke herberekening.
        fields = {
          quantity: q,
          normQuantity: null,
          normFactor: null,
          normUnitPrice: doel / q,
        };
      }

      const item = makeCostItem({
        parentId,
        sortOrder: sortOrder++,
        code,
        description,
        unit: rUnit,
        total: doel,
        depth,
        rowType: 'regel',
        ...fields,
        resourceType,
      });

      items.push(item);
    } else if (entry.type === 'opm') {
      // Tekstregel (opmerking) → text-only row, no calculation
      const row = entry.row;
      const description = cellStr(row, 3);

      const parentId = parentStack.length > 0 ? parentStack[parentStack.length - 1].id : null;
      const depth = parentId ? (parentStack[parentStack.length - 1].depth + 1) : 0;

      const item = makeCostItem({
        parentId,
        sortOrder: sortOrder++,
        description,
        depth,
        rowType: 'tekstregel',
      });

      items.push(item);
    }
  }

  // --- Build schedule ---
  const schedule: CostSchedule = {
    id: genId(),
    name: projectName || 'BasCalc import',
    description: '',
    status: 'DRAFT',
    predefinedType: 'ESTIMATE',
    currency: 'EUR',
    projectName: projectName || '',
    projectNumber: projectNumber || '',
    client: client || '',
    author: author || '',
    ifcGuid: genIfcGuid(),
    uitvoeringskosten,
    algemeneKosten,
    winstRisico,
  };

  return { schedule, items, companyInfo };
}
