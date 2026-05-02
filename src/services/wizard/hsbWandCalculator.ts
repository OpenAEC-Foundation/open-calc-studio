import type { CostItem, CostUnit, RowType } from '@/types/costModel';
import { registerWizard, type WizardResult } from './wizardRegistry';

let _idCounter = 0;
function wizId(): string {
  return `wiz_${Date.now()}_${++_idCounter}`;
}
function wizGuid(): string {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';
  let s = '';
  for (let i = 0; i < 22; i++) s += chars[Math.floor(Math.random() * 64)];
  return s;
}

function makeItem(
  overrides: Partial<CostItem> & { description: string; rowType: RowType; parentId: string | null; sortOrder: number; depth: number },
): CostItem {
  return {
    id: overrides.id ?? wizId(),
    parentId: overrides.parentId,
    sortOrder: overrides.sortOrder,
    code: overrides.code ?? '',
    description: overrides.description,
    unit: overrides.unit ?? 'st',
    quantity: overrides.quantity ?? null,
    materialPrice: overrides.materialPrice ?? null,
    laborPrice: overrides.laborPrice ?? null,
    unitPrice: overrides.unitPrice ?? 0,
    total: overrides.total ?? 0,
    isCollapsed: false,
    depth: overrides.depth,
    notes: '',
    ifcGuid: wizGuid(),
    rowType: overrides.rowType,
    staartPercentage: null,
    nr: '',
    normQuantity: overrides.normQuantity ?? null,
    normFactor: overrides.normFactor ?? null,
    normDivisor: overrides.normDivisor ?? null,
    normUnitPrice: overrides.normUnitPrice ?? null,
    resourceType: overrides.resourceType ?? null,
    resourceLibraryId: null,
    verrekenbaar: overrides.rowType === 'chapter' ? 'V' : null,
    tariefGroep: null,
  };
}

/**
 * HSB-wand (Hout Skelet Bouw wand) calculator
 *
 * Berekent een complete wand opbouw:
 * - Stijlen (verticaal hout)
 * - Onder- en bovenregel
 * - OSB/multiplex beplating
 * - Isolatie
 * - Dampremmer
 * - Gipsplaat binnenafwerking
 */
function calculateHsbWand(params: Record<string, number | string>): WizardResult {
  const lengte = Number(params.lengte) || 5;          // m
  const hoogte = Number(params.hoogte) || 2.6;        // m
  const stijlAfstand = Number(params.stijlAfstand) || 0.6; // m hart-op-hart
  const stijlBreedte = Number(params.stijlBreedte) || 38;  // mm
  const stijlDiepte = Number(params.stijlDiepte) || 140;   // mm
  const isolatieType = String(params.isolatieType || 'mineraleWol');
  const beplatingType = String(params.beplatingType || 'osb');
  const gipsplaat = String(params.gipsplaat || 'ja');

  // Oppervlakte
  const oppervlakte = lengte * hoogte; // m²

  // Stijlen berekening
  const aantalStijlen = Math.ceil(lengte / stijlAfstand) + 1;
  const stijlLengte = hoogte; // m per stijl
  const totaalStijlHout = aantalStijlen * stijlLengte; // m¹

  // Onder- en bovenregel (2 × lengte)
  const regelHout = 2 * lengte; // m¹

  // Beplating (OSB of multiplex)
  const beplatingOpp = oppervlakte; // m²

  // Isolatie
  const isolatieOpp = oppervlakte; // m²

  // Dampremmer folie
  const dampremmerOpp = oppervlakte * 1.1; // 10% overlap

  // Gipsplaat
  const gipsplaatOpp = gipsplaat === 'ja' ? oppervlakte : 0;

  // Prijzen (indicatief, €/eenheid)
  const prijsStijlHout = 4.50;      // €/m¹ (38×140mm naaldhout)
  const prijsRegelHout = 3.80;      // €/m¹ (38×140mm naaldhout)
  const prijsBeplating = beplatingType === 'osb' ? 8.50 : 14.00; // €/m²
  const prijsIsolatie = isolatieType === 'mineraleWol' ? 12.00
    : isolatieType === 'pur' ? 22.00 : 15.00; // €/m²
  const prijsDampremmer = 1.80;     // €/m²
  const prijsGipsplaat = 6.50;      // €/m²

  // Arbeidsprijzen (indicatief)
  const arbeidHout = 18.00;         // €/m¹ (stijlen plaatsen)
  const arbeidRegel = 12.00;        // €/m¹
  const arbeidBeplating = 8.00;     // €/m²
  const arbeidIsolatie = 5.00;      // €/m²
  const arbeidDampremmer = 3.50;    // €/m²
  const arbeidGipsplaat = 9.00;     // €/m²

  // Build items
  const chapterId = wizId();
  const items: CostItem[] = [];
  let sortOrder = 0;

  // Chapter: HSB-wand
  items.push(makeItem({
    id: chapterId,
    description: `HSB-wand ${lengte.toFixed(1)}×${hoogte.toFixed(1)}m`,
    rowType: 'chapter',
    parentId: null,
    sortOrder: sortOrder++,
    depth: 0,
    code: '',
  }));

  // Helper: begrotingspost + regel
  const addPost = (
    desc: string,
    unit: CostUnit,
    qty: number,
    matPrijs: number,
    arbPrijs: number,
  ) => {
    const postId = wizId();
    items.push(makeItem({
      id: postId,
      description: desc,
      rowType: 'begrotingspost',
      parentId: chapterId,
      sortOrder: sortOrder++,
      depth: 1,
      unit,
      quantity: qty,
    }));
    // Materiaal regel
    items.push(makeItem({
      description: `Materiaal ${desc.toLowerCase()}`,
      rowType: 'regel',
      parentId: postId,
      sortOrder: sortOrder++,
      depth: 2,
      unit,
      quantity: qty,
      materialPrice: matPrijs,
      normQuantity: 1,
      normFactor: 1,
      normDivisor: 1,
      normUnitPrice: matPrijs,
      resourceType: 'materiaal',
    }));
    // Arbeid regel
    items.push(makeItem({
      description: `Arbeid ${desc.toLowerCase()}`,
      rowType: 'regel',
      parentId: postId,
      sortOrder: sortOrder++,
      depth: 2,
      unit,
      quantity: qty,
      laborPrice: arbPrijs,
      normQuantity: 1,
      normFactor: 1,
      normDivisor: 1,
      normUnitPrice: arbPrijs,
      resourceType: 'arbeid',
    }));
  };

  // 1. Stijlen
  addPost(`Stijlen ${stijlBreedte}×${stijlDiepte}mm (${aantalStijlen} stuks)`, 'm', totaalStijlHout, prijsStijlHout, arbeidHout);

  // 2. Onder- en bovenregel
  addPost(`Onder-/bovenregel ${stijlBreedte}×${stijlDiepte}mm`, 'm', regelHout, prijsRegelHout, arbeidRegel);

  // 3. Beplating
  const beplLabel = beplatingType === 'osb' ? 'OSB plaat 12mm' : 'Multiplex 12mm';
  addPost(beplLabel, 'm²', beplatingOpp, prijsBeplating, arbeidBeplating);

  // 4. Isolatie
  const isolLabel = isolatieType === 'mineraleWol' ? 'Minerale wol isolatie'
    : isolatieType === 'pur' ? 'PUR isolatie' : 'Glaswol isolatie';
  addPost(`${isolLabel} ${stijlDiepte}mm`, 'm²', isolatieOpp, prijsIsolatie, arbeidIsolatie);

  // 5. Dampremmer
  addPost('Dampremmer folie', 'm²', dampremmerOpp, prijsDampremmer, arbeidDampremmer);

  // 6. Gipsplaat (optioneel)
  if (gipsplaat === 'ja') {
    addPost('Gipsplaat 12,5mm', 'm²', gipsplaatOpp, prijsGipsplaat, arbeidGipsplaat);
  }

  return {
    chapterName: `HSB-wand ${lengte.toFixed(1)}×${hoogte.toFixed(1)}m`,
    items,
  };
}

// Register the HSB wizard
registerWizard({
  id: 'hsb-wand',
  label: 'HSB-wand',
  icon: '🏗️',
  description: 'Hout Skelet Bouw wand — berekent stijlen, regels, beplating, isolatie en afwerking',
  params: [
    { key: 'lengte', label: 'Wandlengte', type: 'number', unit: 'm', defaultValue: 5, min: 0.5, max: 50, step: 0.1 },
    { key: 'hoogte', label: 'Wandhoogte', type: 'number', unit: 'm', defaultValue: 2.6, min: 1, max: 6, step: 0.1 },
    { key: 'stijlAfstand', label: 'Stijlafstand h.o.h.', type: 'number', unit: 'm', defaultValue: 0.6, min: 0.3, max: 1.2, step: 0.05 },
    { key: 'stijlBreedte', label: 'Stijlbreedte', type: 'number', unit: 'mm', defaultValue: 38, min: 38, max: 75 },
    { key: 'stijlDiepte', label: 'Stijldiepte', type: 'number', unit: 'mm', defaultValue: 140, min: 89, max: 235 },
    {
      key: 'isolatieType', label: 'Isolatietype', type: 'select', defaultValue: 'mineraleWol',
      options: [
        { value: 'mineraleWol', label: 'Minerale wol' },
        { value: 'glaswol', label: 'Glaswol' },
        { value: 'pur', label: 'PUR' },
      ],
    },
    {
      key: 'beplatingType', label: 'Beplating', type: 'select', defaultValue: 'osb',
      options: [
        { value: 'osb', label: 'OSB 12mm' },
        { value: 'multiplex', label: 'Multiplex 12mm' },
      ],
    },
    {
      key: 'gipsplaat', label: 'Gipsplaat afwerking', type: 'select', defaultValue: 'ja',
      options: [
        { value: 'ja', label: 'Ja' },
        { value: 'nee', label: 'Nee' },
      ],
    },
  ],
  calculate: calculateHsbWand,
});
