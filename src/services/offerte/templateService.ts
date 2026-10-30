import { uiText } from '../../i18n/uiText';
import type {
  OfferteTemplate, OfferteDocument, OfferteSection,
  BetalingsTermijn, Garantie, CostItem,
} from '@/types/costModel';

function genId(): string {
  return `off_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function defaultBetalingstermijnen(): BetalingsTermijn[] { return [
  { id: genId(), beschrijving: uiText('quotationDefaults.intent', "On signing the letter of intent"), percentage: 4, toelichting: '' },
  { id: genId(), beschrijving: uiText('quotationDefaults.order', "On order confirmation"), percentage: 21, toelichting: '' },
  { id: genId(), beschrijving: uiText('quotationDefaults.start', "On starting work"), percentage: 25, toelichting: '' },
  { id: genId(), beschrijving: uiText('quotationDefaults.shell', "On completing the structural shell"), percentage: 25, toelichting: '' },
  { id: genId(), beschrijving: uiText('quotationDefaults.weathertight', "When wind- and watertight"), percentage: 10, toelichting: '' },
  { id: genId(), beschrijving: uiText('quotationDefaults.handover', "On handover"), percentage: 12, toelichting: '' },
  { id: genId(), beschrijving: uiText('quotationDefaults.maintenance', "After the maintenance period (3 months)"), percentage: 3, toelichting: '' },
]; }

function defaultGaranties(): Garantie[] { return [
  { id: genId(), onderdeel: uiText('quotationDefaults.concrete', "Concrete work"), termijn: uiText('quotationDefaults.years20', "20 years"), toelichting: '', linkedCostItemIds: [] },
  { id: genId(), onderdeel: uiText('quotationDefaults.windows', "Window frames and windows (operation)"), termijn: uiText('quotationDefaults.years3', "3 years"), toelichting: '', linkedCostItemIds: [] },
  { id: genId(), onderdeel: uiText('quotationDefaults.roof', "Roof covering"), termijn: uiText('quotationDefaults.years10', "10 years"), toelichting: '', linkedCostItemIds: [] },
  { id: genId(), onderdeel: uiText('quotationDefaults.paint', "Painting"), termijn: uiText('quotationDefaults.years3', "3 years"), toelichting: '', linkedCostItemIds: [] },
  { id: genId(), onderdeel: uiText('quotationDefaults.services', "Building services"), termijn: uiText('quotationDefaults.years2', "2 years"), toelichting: '', linkedCostItemIds: [] },
]; }

const defaultVoorwaarden = () => uiText('quotationDefaults.terms', "All our offers are subject to UAV 2012 and our general terms and conditions.");

export function getBuiltInTemplates(): OfferteTemplate[] {
  return [
    {
      id: 'tpl_waterwoning',
      name: uiText('quotationDefaults.waterHome', "Floating home"),
      projectType: 'waterwoning',
      sections: [
        { titel: uiText('quotationDefaults.yard', "Construction yard"), type: 'technisch', linkedChapterCodes: ['05'] },
        { titel: uiText('quotationDefaults.structure', "Structural shell"), type: 'technisch', linkedChapterCodes: ['10', '21', '24', '30', '31', '33'] },
        { titel: uiText('quotationDefaults.finishes', "Finishing work"), type: 'technisch', linkedChapterCodes: ['40', '41', '42', '45'] },
        { titel: uiText('quotationDefaults.services', "Building services"), type: 'technisch', linkedChapterCodes: ['51', '52', '60', '61', '70'] },
        { titel: uiText('quotationDefaults.allowances', "Provisional sums"), type: 'vrij', linkedChapterCodes: [] },
        { titel: uiText('quotationDefaults.extra', "Additional work"), type: 'meerwerk', linkedChapterCodes: [] },
        { titel: uiText('quotationDefaults.client', "To be arranged by the client"), type: 'opdrachtgever', linkedChapterCodes: [] },
      ],
      defaultBetalingstermijnen: defaultBetalingstermijnen().map(t => ({ ...t, id: genId() })),
      defaultGaranties: defaultGaranties().map(g => ({ ...g, id: genId() })),
      defaultVoorwaarden: defaultVoorwaarden(),
    },
    {
      id: 'tpl_woning',
      name: uiText('quotationDefaults.home', "House"),
      projectType: 'woning',
      sections: [
        { titel: uiText('quotationDefaults.site', "Construction site"), type: 'technisch', linkedChapterCodes: ['05'] },
        { titel: uiText('quotationDefaults.structure', "Structural shell"), type: 'technisch', linkedChapterCodes: ['10', '21', '24', '25', '30', '33'] },
        { titel: uiText('quotationDefaults.finishes', "Finishing work"), type: 'technisch', linkedChapterCodes: ['40', '41', '42', '45'] },
        { titel: uiText('quotationDefaults.services', "Building services"), type: 'technisch', linkedChapterCodes: ['51', '52', '60', '61', '70'] },
        { titel: uiText('quotationDefaults.extra', "Additional work"), type: 'meerwerk', linkedChapterCodes: [] },
      ],
      defaultBetalingstermijnen: defaultBetalingstermijnen().map(t => ({ ...t, id: genId() })),
      defaultGaranties: defaultGaranties().map(g => ({ ...g, id: genId() })),
      defaultVoorwaarden: defaultVoorwaarden(),
    },
    {
      id: 'tpl_renovatie',
      name: uiText('quotationDefaults.renovation', "Renovation"),
      projectType: 'renovatie',
      sections: [
        { titel: uiText('quotationDefaults.demolition', "Demolition"), type: 'technisch', linkedChapterCodes: ['01'] },
        { titel: uiText('quotationDefaults.structure', "Structural shell"), type: 'technisch', linkedChapterCodes: ['21', '24', '30'] },
        { titel: uiText('quotationDefaults.finishes', "Finishing work"), type: 'technisch', linkedChapterCodes: ['40', '41', '42', '45'] },
        { titel: uiText('quotationDefaults.services', "Building services"), type: 'technisch', linkedChapterCodes: ['60', '70'] },
        { titel: uiText('quotationDefaults.extra', "Additional work"), type: 'meerwerk', linkedChapterCodes: [] },
      ],
      defaultBetalingstermijnen: defaultBetalingstermijnen().map(t => ({ ...t, id: genId() })),
      defaultGaranties: defaultGaranties().map(g => ({ ...g, id: genId() })),
      defaultVoorwaarden: defaultVoorwaarden(),
    },
  ];
}

/**
 * Apply a template to generate a partially filled OfferteDocument.
 * Links sections to chapters by matching chapter codes in the cost items.
 */
export function applyTemplate(
  template: OfferteTemplate,
  items: CostItem[],
): Partial<OfferteDocument> {
  const chapters = items.filter(i => i.rowType === 'chapter' && (i.depth ?? 0) === 0);

  const secties: OfferteSection[] = template.sections.map((ts) => {
    const matchedChapter = ts.linkedChapterCodes.length > 0
      ? chapters.find(ch => ts.linkedChapterCodes.some(code => ch.code.startsWith(code)))
      : null;

    return {
      id: genId(),
      titel: ts.titel,
      type: ts.type,
      linkedChapterId: matchedChapter?.id ?? null,
      begeleidendeTekst: '',
      items: [],
    };
  });

  return {
    secties,
    betalingstermijnen: template.defaultBetalingstermijnen.map(t => ({ ...t, id: genId() })),
    garanties: template.defaultGaranties.map(g => ({ ...g, id: genId() })),
    voorwaarden: template.defaultVoorwaarden,
  };
}
