import type { CostItem, CostSchedule } from '@/types/costModel';
import { createDefaultProjectProperties } from '@/types/costModel';
import i18next from 'i18next';
import { recalculateItems } from '@/services/calculation/calculator';

function generateIfcGuid(): string {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';
  let r = '';
  for (let i = 0; i < 22; i++) r += chars[Math.floor(Math.random() * 64)];
  return r;
}

/** Empty schedule for initial state before async load */
export function createDefaultSchedule(): CostSchedule {
  return {
    id: crypto.randomUUID(),
    name: i18next.t('newBudget', { defaultValue: 'New budget' }),
    description: '',
    status: 'DRAFT',
    predefinedType: 'ESTIMATE',
    currency: 'EUR',
    projectName: '',
    projectNumber: '',
    client: '',
    author: '',
    ifcGuid: generateIfcGuid(),
    uitvoeringskosten: 6,
    algemeneKosten: 9,
    winstRisico: 5,
    projectProperties: createDefaultProjectProperties(),
  };
}

/** Default items with staartkosten for a new budget */
export function createDefaultItems(): CostItem[] {
  const makeItem = (rowType: string, description: string, pct: number | null, sortOrder: number): CostItem => ({
    id: crypto.randomUUID(),
    parentId: null,
    sortOrder,
    code: '',
    description,
    unit: pct !== null ? '%' : 'st',
    quantity: pct,
    materialPrice: null,
    laborPrice: null,
    unitPrice: 0,
    total: 0,
    isCollapsed: false,
    depth: 0,
    notes: '',
    ifcGuid: generateIfcGuid(),
    rowType: rowType as any,
    staartPercentage: pct,
    nr: '',
    normQuantity: null,
    normFactor: null,
    normDivisor: null,
    normUnitPrice: null,
    resourceType: null,
    resourceLibraryId: null,
    verrekenbaar: null,
    tariefGroep: null,
  });

  return [
    makeItem('staart_ak_oa', 'Algemene kosten over onderaanneming:', 9, 9000),
    makeItem('staart_abk', 'Algemene bedrijfskosten:', 6, 9001),
    makeItem('staart_garanties', 'Garanties:', 2, 9002),
    makeItem('staart_wvpm', 'Werkvoorbereiding & projectmanagement', 2, 9003),
    makeItem('staart_risico', 'Risico:', 3, 9004),
    makeItem('staart_winst', 'Winst:', 5, 9005),
    makeItem('staart_verzekering', 'Verzekering:', 0.5, 9006),
    makeItem('staart_btw', 'Btw hoog:', 21, 9007),
    makeItem('staart_afronding', 'Afronding', null, 9008),
  ];
}

/** Load the test-begroting from the bundled JSON file */
export async function loadDefaultBudget(): Promise<{ schedule: CostSchedule; items: CostItem[] }> {
  const resp = await fetch('/data/test-begroting.json');
  if (!resp.ok) throw new Error('Kan standaard begroting niet laden');
  const data = await resp.json();
  return {
    schedule: data.schedule as CostSchedule,
    items: recalculateItems(data.items as CostItem[]),
  };
}
