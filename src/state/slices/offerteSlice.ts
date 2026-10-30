import { uiText } from '../../i18n/uiText';
import type { StateCreator } from 'zustand';
import type {
  OfferteDocument, OfferteType, OfferteSection, OfferteSectionItem,
  OfferteSectionType, BetalingsTermijn, Garantie, Ondertekenaar, OfferteGeadresseerde,
  OfferteProperty, OfferteMaterialLayer, OfferteImage, ProjectInfo,
} from '@/types/costModel';
import { createDefaultProjectInfo } from '@/types/costModel';

function genId(): string {
  return `off_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ── Default templates ──

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

const defaultOndertekening: Ondertekenaar[] = [
  { naam: '', functie: '', email: '', telefoon: '' },
];

export function createDefaultOfferte(): OfferteDocument {
  return {
    id: genId(),
    type: 'particulier',
    offerteNummer: '',
    offerteDatum: new Date().toISOString().split('T')[0],
    geldigheid: 30,
    geadresseerde: { naam: '', adres: '', postcode: '', plaats: '' },
    begeleidendSchrijven: '',
    secties: [],
    betalingstermijnen: [...defaultBetalingstermijnen()],
    garanties: [...defaultGaranties()],
    voorwaarden: uiText('quotationDefaults.terms', "All our offers are subject to UAV 2012 and our general terms and conditions."),
    ondertekening: [...defaultOndertekening],
  };
}

// ── Slice ──

export interface OfferteSlice {
  offerte: OfferteDocument;

  // Document-level
  setOfferteType: (type: OfferteType) => void;
  setOfferteField: (field: Partial<OfferteDocument>) => void;
  setGeadresseerde: (g: Partial<OfferteGeadresseerde>) => void;
  setOfferte: (doc: OfferteDocument) => void;
  resetOfferte: () => void;

  // Secties
  addSection: (type: OfferteSectionType, titel?: string) => string;
  removeSection: (id: string) => void;
  updateSection: (id: string, updates: Partial<OfferteSection>) => void;
  moveSectionUp: (id: string) => void;
  moveSectionDown: (id: string) => void;
  setActiveSectionId: (id: string | null) => void;
  activeSectionId: string | null;

  // Section items
  addSectionItem: (sectionId: string) => void;
  removeSectionItem: (sectionId: string, itemId: string) => void;
  updateSectionItem: (sectionId: string, itemId: string, updates: Partial<OfferteSectionItem>) => void;

  // Properties (per section item)
  addProperty: (sectionId: string, itemId: string) => void;
  removeProperty: (sectionId: string, itemId: string, propertyId: string) => void;
  updateProperty: (sectionId: string, itemId: string, propertyId: string, updates: Partial<OfferteProperty>) => void;

  // Material layers (per section item)
  addLayer: (sectionId: string, itemId: string) => void;
  removeLayer: (sectionId: string, itemId: string, layerId: string) => void;
  updateLayer: (sectionId: string, itemId: string, layerId: string, updates: Partial<OfferteMaterialLayer>) => void;
  moveLayerUp: (sectionId: string, itemId: string, layerId: string) => void;
  moveLayerDown: (sectionId: string, itemId: string, layerId: string) => void;

  // Images (per section item)
  addImage: (sectionId: string, itemId: string, image: OfferteImage) => void;
  removeImage: (sectionId: string, itemId: string, imageId: string) => void;
  updateImage: (sectionId: string, itemId: string, imageId: string, updates: Partial<OfferteImage>) => void;

  // Sub-items (per section item)
  addSubItem: (sectionId: string, itemId: string, text: string) => void;
  removeSubItem: (sectionId: string, itemId: string, index: number) => void;
  updateSubItem: (sectionId: string, itemId: string, index: number, text: string) => void;

  // Linking (section item to cost item)
  linkSectionItemToCostItem: (sectionId: string, itemId: string, costItemId: string) => void;
  unlinkSectionItemFromCostItem: (sectionId: string, itemId: string) => void;

  // Betalingstermijnen
  addBetalingsTermijn: () => void;
  removeBetalingsTermijn: (id: string) => void;
  updateBetalingsTermijn: (id: string, updates: Partial<BetalingsTermijn>) => void;

  // Garanties
  addGarantie: () => void;
  removeGarantie: (id: string) => void;
  updateGarantie: (id: string, updates: Partial<Garantie>) => void;

  // Ondertekening
  setOndertekening: (o: Ondertekenaar[]) => void;
  updateOndertekenaar: (index: number, updates: Partial<Ondertekenaar>) => void;

  // Legacy compatibility (used by old OfferteTab/View)
  offerteSettings: { staartInEP: boolean; afrondingNiveau: number; globaleKorting: number; btwPercentage: number; offerteNummer: string; offerteDatum: string; geldigheid: number; betreft: string; opdrachtgever: string; voorwaarden: string; ondertekeningNaam: string; ondertekeningFunctie: string; };
  offerteOverrides: Record<string, { selected: boolean; kortingPct: number; opslagPct: number; offerteEP: number | null; verrekenprijs: number | null }>;
  setOfferteSettings: (s: Partial<OfferteSlice['offerteSettings']>) => void;
  toggleOffertePost: (itemId: string) => void;
  selectAllOffertePosts: () => void;
  deselectAllOffertePosts: () => void;
  setPostOverride: (itemId: string, override: Partial<OfferteSlice['offerteOverrides'][string]>) => void;
  initOfferteFromItems: (itemIds: string[]) => void;
  includeCover: boolean;
  includeSummary: boolean;
  toggleIncludeCover: () => void;
  toggleIncludeSummary: () => void;

  projectInfo: ProjectInfo;
  setProjectInfo: (updates: Partial<ProjectInfo>) => void;
}

export const createOfferteSlice: StateCreator<OfferteSlice> = (set, get) => {
  // Hydration and navigation keep their original setter; user edits must trigger Save/close protection.
  const edit = (patch: Partial<OfferteSlice> | ((state: OfferteSlice) => Partial<OfferteSlice>)) => {
    set(patch);
    const state = get() as unknown as { activeDocumentId?: string; updateDocument?: (id: string, patch: { isModified: boolean }) => void };
    if (state.activeDocumentId) state.updateDocument?.(state.activeDocumentId, { isModified: true });
  };

  return ({
  offerte: createDefaultOfferte(),
  activeSectionId: null,

  // Document-level
  setOfferteType: (type) => edit((s) => ({ offerte: { ...s.offerte, type } })),
  setOfferteField: (field) => edit((s) => ({ offerte: { ...s.offerte, ...field } })),
  setGeadresseerde: (g) => edit((s) => ({
    offerte: { ...s.offerte, geadresseerde: { ...s.offerte.geadresseerde, ...g } },
  })),
  setOfferte: (doc) => set({ offerte: doc }),
  resetOfferte: () => edit({ offerte: createDefaultOfferte() }),

  // Secties
  addSection: (type, titel) => {
    const id = genId();
    const defaultTitels: Record<string, string> = {
      technisch: uiText('quotationDefaults.technical', "Technical specification"),
      opties: uiText('quotationDefaults.options', "Options / additional work"),
      opdrachtgever: uiText('quotationDefaults.client', "To be arranged by the client"),
      betalingstermijnen: uiText('quotationDefaults.payments', "Payment schedule"),
      garanties: uiText('quotationDefaults.guarantees', "Guarantees"),
      vrij: uiText('quotationDefaults.free', "Custom section"),
      meerwerk: uiText('quotationDefaults.extra', "Additional work"),
    };
    edit((s) => ({
      offerte: {
        ...s.offerte,
        secties: [...s.offerte.secties, {
          id,
          titel: titel || defaultTitels[type] || uiText('quotationDefaults.newSection', "New section"),
          type,
          linkedChapterId: null,
          begeleidendeTekst: '',
          items: [],
        }],
      },
    }));
    return id;
  },

  removeSection: (id) => edit((s) => ({
    offerte: { ...s.offerte, secties: s.offerte.secties.filter((sec) => sec.id !== id) },
  })),

  updateSection: (id, updates) => edit((s) => ({
    offerte: {
      ...s.offerte,
      secties: s.offerte.secties.map((sec) => sec.id === id ? { ...sec, ...updates } : sec),
    },
  })),

  moveSectionUp: (id) => edit((s) => {
    const idx = s.offerte.secties.findIndex((sec) => sec.id === id);
    if (idx <= 0) return s;
    const secties = [...s.offerte.secties];
    [secties[idx - 1], secties[idx]] = [secties[idx], secties[idx - 1]];
    return { offerte: { ...s.offerte, secties } };
  }),

  moveSectionDown: (id) => edit((s) => {
    const idx = s.offerte.secties.findIndex((sec) => sec.id === id);
    if (idx < 0 || idx >= s.offerte.secties.length - 1) return s;
    const secties = [...s.offerte.secties];
    [secties[idx], secties[idx + 1]] = [secties[idx + 1], secties[idx]];
    return { offerte: { ...s.offerte, secties } };
  }),

  setActiveSectionId: (id) => set({ activeSectionId: id }),

  // Section items
  addSectionItem: (sectionId) => edit((s) => ({
    offerte: {
      ...s.offerte,
      secties: s.offerte.secties.map((sec) =>
        sec.id === sectionId
          ? { ...sec, items: [...sec.items, { id: genId(), onderdeel: '', omschrijving: '', afbeeldingPath: null, linkedCostItemId: null, properties: [], layers: [], priceOverride: null, pricePerUnit: null, priceUnit: null, isSelected: false, afbeeldingen: [], subItems: [] }] }
          : sec,
      ),
    },
  })),

  removeSectionItem: (sectionId, itemId) => edit((s) => ({
    offerte: {
      ...s.offerte,
      secties: s.offerte.secties.map((sec) =>
        sec.id === sectionId
          ? { ...sec, items: sec.items.filter((it) => it.id !== itemId) }
          : sec,
      ),
    },
  })),

  updateSectionItem: (sectionId, itemId, updates) => edit((s) => ({
    offerte: {
      ...s.offerte,
      secties: s.offerte.secties.map((sec) =>
        sec.id === sectionId
          ? { ...sec, items: sec.items.map((it) => it.id === itemId ? { ...it, ...updates } : it) }
          : sec,
      ),
    },
  })),

  // Properties
  addProperty: (sectionId, itemId) => edit((s) => ({
    offerte: {
      ...s.offerte,
      secties: s.offerte.secties.map((sec) =>
        sec.id !== sectionId ? sec : {
          ...sec,
          items: sec.items.map((it) =>
            it.id !== itemId ? it : { ...it, properties: [...it.properties, { id: genId(), name: '', value: '', unit: undefined }] }
          ),
        }
      ),
    },
  })),

  removeProperty: (sectionId, itemId, propertyId) => edit((s) => ({
    offerte: {
      ...s.offerte,
      secties: s.offerte.secties.map((sec) =>
        sec.id !== sectionId ? sec : {
          ...sec,
          items: sec.items.map((it) =>
            it.id !== itemId ? it : { ...it, properties: it.properties.filter((p) => p.id !== propertyId) }
          ),
        }
      ),
    },
  })),

  updateProperty: (sectionId, itemId, propertyId, updates) => edit((s) => ({
    offerte: {
      ...s.offerte,
      secties: s.offerte.secties.map((sec) =>
        sec.id !== sectionId ? sec : {
          ...sec,
          items: sec.items.map((it) =>
            it.id !== itemId ? it : {
              ...it,
              properties: it.properties.map((p) => p.id !== propertyId ? p : { ...p, ...updates }),
            }
          ),
        }
      ),
    },
  })),

  // Layers
  addLayer: (sectionId, itemId) => edit((s) => ({
    offerte: {
      ...s.offerte,
      secties: s.offerte.secties.map((sec) =>
        sec.id !== sectionId ? sec : {
          ...sec,
          items: sec.items.map((it) =>
            it.id !== itemId ? it : {
              ...it,
              layers: [...it.layers, { id: genId(), material: '', thickness: null, function: 'overig', rcValue: null }],
            }
          ),
        }
      ),
    },
  })),

  removeLayer: (sectionId, itemId, layerId) => edit((s) => ({
    offerte: {
      ...s.offerte,
      secties: s.offerte.secties.map((sec) =>
        sec.id !== sectionId ? sec : {
          ...sec,
          items: sec.items.map((it) =>
            it.id !== itemId ? it : { ...it, layers: it.layers.filter((l) => l.id !== layerId) }
          ),
        }
      ),
    },
  })),

  updateLayer: (sectionId, itemId, layerId, updates) => edit((s) => ({
    offerte: {
      ...s.offerte,
      secties: s.offerte.secties.map((sec) =>
        sec.id !== sectionId ? sec : {
          ...sec,
          items: sec.items.map((it) =>
            it.id !== itemId ? it : {
              ...it,
              layers: it.layers.map((l) => l.id !== layerId ? l : { ...l, ...updates }),
            }
          ),
        }
      ),
    },
  })),

  moveLayerUp: (sectionId, itemId, layerId) => edit((s) => ({
    offerte: {
      ...s.offerte,
      secties: s.offerte.secties.map((sec) => {
        if (sec.id !== sectionId) return sec;
        return {
          ...sec,
          items: sec.items.map((it) => {
            if (it.id !== itemId) return it;
            const idx = it.layers.findIndex((l) => l.id === layerId);
            if (idx <= 0) return it;
            const layers = [...it.layers];
            [layers[idx - 1], layers[idx]] = [layers[idx], layers[idx - 1]];
            return { ...it, layers };
          }),
        };
      }),
    },
  })),

  moveLayerDown: (sectionId, itemId, layerId) => edit((s) => ({
    offerte: {
      ...s.offerte,
      secties: s.offerte.secties.map((sec) => {
        if (sec.id !== sectionId) return sec;
        return {
          ...sec,
          items: sec.items.map((it) => {
            if (it.id !== itemId) return it;
            const idx = it.layers.findIndex((l) => l.id === layerId);
            if (idx < 0 || idx >= it.layers.length - 1) return it;
            const layers = [...it.layers];
            [layers[idx], layers[idx + 1]] = [layers[idx + 1], layers[idx]];
            return { ...it, layers };
          }),
        };
      }),
    },
  })),

  // Images
  addImage: (sectionId, itemId, image) => edit((s) => ({
    offerte: {
      ...s.offerte,
      secties: s.offerte.secties.map((sec) =>
        sec.id !== sectionId ? sec : {
          ...sec,
          items: sec.items.map((it) =>
            it.id !== itemId ? it : { ...it, afbeeldingen: [...it.afbeeldingen, image] }
          ),
        }
      ),
    },
  })),

  removeImage: (sectionId, itemId, imageId) => edit((s) => ({
    offerte: {
      ...s.offerte,
      secties: s.offerte.secties.map((sec) =>
        sec.id !== sectionId ? sec : {
          ...sec,
          items: sec.items.map((it) =>
            it.id !== itemId ? it : { ...it, afbeeldingen: it.afbeeldingen.filter((img) => img.id !== imageId) }
          ),
        }
      ),
    },
  })),

  updateImage: (sectionId, itemId, imageId, updates) => edit((s) => ({
    offerte: {
      ...s.offerte,
      secties: s.offerte.secties.map((sec) =>
        sec.id !== sectionId ? sec : {
          ...sec,
          items: sec.items.map((it) =>
            it.id !== itemId ? it : {
              ...it,
              afbeeldingen: it.afbeeldingen.map((img) => img.id !== imageId ? img : { ...img, ...updates }),
            }
          ),
        }
      ),
    },
  })),

  // Sub-items
  addSubItem: (sectionId, itemId, text) => edit((s) => ({
    offerte: {
      ...s.offerte,
      secties: s.offerte.secties.map((sec) =>
        sec.id !== sectionId ? sec : {
          ...sec,
          items: sec.items.map((it) =>
            it.id !== itemId ? it : { ...it, subItems: [...it.subItems, text] }
          ),
        }
      ),
    },
  })),

  removeSubItem: (sectionId, itemId, index) => edit((s) => ({
    offerte: {
      ...s.offerte,
      secties: s.offerte.secties.map((sec) =>
        sec.id !== sectionId ? sec : {
          ...sec,
          items: sec.items.map((it) =>
            it.id !== itemId ? it : { ...it, subItems: it.subItems.filter((_, i) => i !== index) }
          ),
        }
      ),
    },
  })),

  updateSubItem: (sectionId, itemId, index, text) => edit((s) => ({
    offerte: {
      ...s.offerte,
      secties: s.offerte.secties.map((sec) =>
        sec.id !== sectionId ? sec : {
          ...sec,
          items: sec.items.map((it) =>
            it.id !== itemId ? it : { ...it, subItems: it.subItems.map((s, i) => i === index ? text : s) }
          ),
        }
      ),
    },
  })),

  // Linking (section item to cost item)
  linkSectionItemToCostItem: (sectionId, itemId, costItemId) => edit((s) => ({
    offerte: {
      ...s.offerte,
      secties: s.offerte.secties.map((sec) =>
        sec.id !== sectionId ? sec : {
          ...sec,
          items: sec.items.map((it) =>
            it.id !== itemId ? it : { ...it, linkedCostItemId: costItemId }
          ),
        }
      ),
    },
  })),

  unlinkSectionItemFromCostItem: (sectionId, itemId) => edit((s) => ({
    offerte: {
      ...s.offerte,
      secties: s.offerte.secties.map((sec) =>
        sec.id !== sectionId ? sec : {
          ...sec,
          items: sec.items.map((it) =>
            it.id !== itemId ? it : { ...it, linkedCostItemId: null }
          ),
        }
      ),
    },
  })),

  // Betalingstermijnen
  addBetalingsTermijn: () => edit((s) => ({
    offerte: {
      ...s.offerte,
      betalingstermijnen: [...s.offerte.betalingstermijnen, { id: genId(), beschrijving: '', percentage: 0, toelichting: '' }],
    },
  })),

  removeBetalingsTermijn: (id) => edit((s) => ({
    offerte: {
      ...s.offerte,
      betalingstermijnen: s.offerte.betalingstermijnen.filter((t) => t.id !== id),
    },
  })),

  updateBetalingsTermijn: (id, updates) => edit((s) => ({
    offerte: {
      ...s.offerte,
      betalingstermijnen: s.offerte.betalingstermijnen.map((t) => t.id === id ? { ...t, ...updates } : t),
    },
  })),

  // Garanties
  addGarantie: () => edit((s) => ({
    offerte: {
      ...s.offerte,
      garanties: [...s.offerte.garanties, { id: genId(), onderdeel: '', termijn: '', toelichting: '', linkedCostItemIds: [] }],
    },
  })),

  removeGarantie: (id) => edit((s) => ({
    offerte: {
      ...s.offerte,
      garanties: s.offerte.garanties.filter((g) => g.id !== id),
    },
  })),

  updateGarantie: (id, updates) => edit((s) => ({
    offerte: {
      ...s.offerte,
      garanties: s.offerte.garanties.map((g) => g.id === id ? { ...g, ...updates } : g),
    },
  })),

  // Ondertekening
  setOndertekening: (o) => edit((s) => ({ offerte: { ...s.offerte, ondertekening: o } })),
  updateOndertekenaar: (index, updates) => edit((s) => {
    const ond = [...s.offerte.ondertekening];
    ond[index] = { ...ond[index], ...updates };
    return { offerte: { ...s.offerte, ondertekening: ond } };
  }),

  // ── Legacy compatibility (RAW offerte + old UI) ──
  offerteSettings: {
    staartInEP: true, afrondingNiveau: 0.01, globaleKorting: 0, btwPercentage: 21,
    offerteNummer: '', offerteDatum: new Date().toISOString().split('T')[0],
    geldigheid: 30, betreft: '', opdrachtgever: '', voorwaarden: uiText('quotationDefaults.terms', "All our offers are subject to UAV 2012 and our general terms and conditions."),
    ondertekeningNaam: '', ondertekeningFunctie: '',
  },
  offerteOverrides: {},
  setOfferteSettings: (partial) => edit((s) => ({ offerteSettings: { ...s.offerteSettings, ...partial } })),
  toggleOffertePost: (itemId) => edit((s) => {
    const current = s.offerteOverrides[itemId];
    const selected = current ? !current.selected : false;
    return { offerteOverrides: { ...s.offerteOverrides, [itemId]: { ...(current ?? { selected: true, kortingPct: 0, opslagPct: 0, offerteEP: null, verrekenprijs: null }), selected } } };
  }),
  selectAllOffertePosts: () => edit((s) => {
    const updated = { ...s.offerteOverrides };
    for (const key of Object.keys(updated)) updated[key] = { ...updated[key], selected: true };
    return { offerteOverrides: updated };
  }),
  deselectAllOffertePosts: () => edit((s) => {
    const updated = { ...s.offerteOverrides };
    for (const key of Object.keys(updated)) updated[key] = { ...updated[key], selected: false };
    return { offerteOverrides: updated };
  }),
  setPostOverride: (itemId, override) => edit((s) => {
    const current = s.offerteOverrides[itemId] ?? { selected: true, kortingPct: 0, opslagPct: 0, offerteEP: null, verrekenprijs: null };
    return { offerteOverrides: { ...s.offerteOverrides, [itemId]: { ...current, ...override } } };
  }),
  initOfferteFromItems: (itemIds) => edit((s) => {
    const overrides: Record<string, any> = {};
    for (const id of itemIds) {
      overrides[id] = s.offerteOverrides[id] ?? { selected: true, kortingPct: 0, opslagPct: 0, offerteEP: null, verrekenprijs: null };
    }
    return { offerteOverrides: overrides };
  }),
  includeCover: false,
  includeSummary: false,
  toggleIncludeCover: () => set((s) => ({ includeCover: !s.includeCover })),
  toggleIncludeSummary: () => set((s) => ({ includeSummary: !s.includeSummary })),

  projectInfo: createDefaultProjectInfo(),
  setProjectInfo: (updates) => set((s) => ({ projectInfo: { ...s.projectInfo, ...updates } })),
});
};
