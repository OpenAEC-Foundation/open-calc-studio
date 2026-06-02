import type {
  OfferteTemplate, OfferteDocument, OfferteSection,
  BetalingsTermijn, Garantie, CostItem,
} from '@/types/costModel';

function genId(): string {
  return `off_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const defaultBetalingstermijnen: BetalingsTermijn[] = [
  { id: genId(), beschrijving: 'Bij tekenen intentieovereenkomst', percentage: 4, toelichting: '' },
  { id: genId(), beschrijving: 'Bij opdracht', percentage: 21, toelichting: '' },
  { id: genId(), beschrijving: 'Bij start werkzaamheden', percentage: 25, toelichting: '' },
  { id: genId(), beschrijving: 'Bij gereed ruwbouw', percentage: 25, toelichting: '' },
  { id: genId(), beschrijving: 'Bij wind- en waterdicht', percentage: 10, toelichting: '' },
  { id: genId(), beschrijving: 'Bij oplevering', percentage: 12, toelichting: '' },
  { id: genId(), beschrijving: 'Na onderhoudstermijn (3 maanden)', percentage: 3, toelichting: '' },
];

const defaultGaranties: Garantie[] = [
  { id: genId(), onderdeel: 'Betonwerk', termijn: '20 jaar', toelichting: '', linkedCostItemIds: [] },
  { id: genId(), onderdeel: 'Kozijnen en ramen (werking)', termijn: '3 jaar', toelichting: '', linkedCostItemIds: [] },
  { id: genId(), onderdeel: 'Dakbedekking', termijn: '10 jaar', toelichting: '', linkedCostItemIds: [] },
  { id: genId(), onderdeel: 'Schilderwerk', termijn: '3 jaar', toelichting: '', linkedCostItemIds: [] },
  { id: genId(), onderdeel: 'Installaties', termijn: '2 jaar', toelichting: '', linkedCostItemIds: [] },
];

const defaultVoorwaarden = 'Op al onze aanbiedingen zijn de UAV 2012 en onze algemene voorwaarden van toepassing.';

export function getBuiltInTemplates(): OfferteTemplate[] {
  return [
    {
      id: 'tpl_waterwoning',
      name: 'Waterwoning',
      projectType: 'waterwoning',
      sections: [
        { titel: 'Bouwwerf', type: 'technisch', linkedChapterCodes: ['05'] },
        { titel: 'Ruwbouw', type: 'technisch', linkedChapterCodes: ['10', '21', '24', '30', '31', '33'] },
        { titel: 'Afbouw', type: 'technisch', linkedChapterCodes: ['40', '41', '42', '45'] },
        { titel: 'Installaties', type: 'technisch', linkedChapterCodes: ['51', '52', '60', '61', '70'] },
        { titel: 'Stelposten', type: 'vrij', linkedChapterCodes: [] },
        { titel: 'Meerwerk', type: 'meerwerk', linkedChapterCodes: [] },
        { titel: 'Te regelen door opdrachtgever', type: 'opdrachtgever', linkedChapterCodes: [] },
      ],
      defaultBetalingstermijnen: defaultBetalingstermijnen.map(t => ({ ...t, id: genId() })),
      defaultGaranties: defaultGaranties.map(g => ({ ...g, id: genId() })),
      defaultVoorwaarden,
    },
    {
      id: 'tpl_woning',
      name: 'Woning',
      projectType: 'woning',
      sections: [
        { titel: 'Bouwplaats', type: 'technisch', linkedChapterCodes: ['05'] },
        { titel: 'Ruwbouw', type: 'technisch', linkedChapterCodes: ['10', '21', '24', '25', '30', '33'] },
        { titel: 'Afbouw', type: 'technisch', linkedChapterCodes: ['40', '41', '42', '45'] },
        { titel: 'Installaties', type: 'technisch', linkedChapterCodes: ['51', '52', '60', '61', '70'] },
        { titel: 'Meerwerk', type: 'meerwerk', linkedChapterCodes: [] },
      ],
      defaultBetalingstermijnen: defaultBetalingstermijnen.map(t => ({ ...t, id: genId() })),
      defaultGaranties: defaultGaranties.map(g => ({ ...g, id: genId() })),
      defaultVoorwaarden,
    },
    {
      id: 'tpl_renovatie',
      name: 'Renovatie',
      projectType: 'renovatie',
      sections: [
        { titel: 'Sloop', type: 'technisch', linkedChapterCodes: ['01'] },
        { titel: 'Ruwbouw', type: 'technisch', linkedChapterCodes: ['21', '24', '30'] },
        { titel: 'Afbouw', type: 'technisch', linkedChapterCodes: ['40', '41', '42', '45'] },
        { titel: 'Installaties', type: 'technisch', linkedChapterCodes: ['60', '70'] },
        { titel: 'Meerwerk', type: 'meerwerk', linkedChapterCodes: [] },
      ],
      defaultBetalingstermijnen: defaultBetalingstermijnen.map(t => ({ ...t, id: genId() })),
      defaultGaranties: defaultGaranties.map(g => ({ ...g, id: genId() })),
      defaultVoorwaarden,
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
