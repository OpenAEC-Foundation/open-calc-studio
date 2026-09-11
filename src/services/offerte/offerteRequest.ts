/**
 * Het verzoek voor de offerte-PDF (Rust-commando `generate_offerte_pdf`),
 * opgebouwd uit de store. Gedeeld door de offertetab en de REST/MCP-export,
 * zodat beide dezelfde PDF opleveren.
 */
import { useAppStore } from '@/state/appStore';

type Store = ReturnType<typeof useAppStore.getState>;

export function buildOfferteRequest(store: Store = useAppStore.getState()) {
  return {
    offerte: {
      offerteNummer: store.offerte.offerteNummer,
      offerteDatum: store.offerte.offerteDatum,
      geldigheid: store.offerte.geldigheid,
      geadresseerde: store.offerte.geadresseerde,
      begeleidendSchrijven: store.offerte.begeleidendSchrijven,
      secties: store.offerte.secties.map(s => ({
        titel: s.titel,
        type: s.type,
        begeleidendeTekst: s.begeleidendeTekst,
        items: s.items.map(i => ({
          onderdeel: i.onderdeel,
          omschrijving: i.omschrijving,
          afbeeldingen: i.afbeeldingen.map(img => ({
            path: img.path,
            thumbnail: img.thumbnail,
            caption: img.caption,
            widthMm: img.widthMm,
          })),
          subItems: i.subItems,
          properties: i.properties.map(p => ({ name: p.name, value: p.value, unit: p.unit })),
          priceOverride: i.priceOverride,
          pricePerUnit: i.pricePerUnit,
          priceUnit: i.priceUnit,
          isSelected: i.isSelected,
        })),
      })),
      betalingstermijnen: store.offerte.betalingstermijnen.map(t => ({
        beschrijving: t.beschrijving,
        percentage: t.percentage,
        toelichting: t.toelichting,
      })),
      garanties: store.offerte.garanties.map(g => ({
        onderdeel: g.onderdeel,
        termijn: g.termijn,
        toelichting: g.toelichting,
      })),
      voorwaarden: store.offerte.voorwaarden,
      ondertekening: store.offerte.ondertekening,
      projectInfo: store.projectInfo.projectType ? {
        projectType: store.projectInfo.projectType,
        architect: store.projectInfo.architect,
        locatie: store.projectInfo.locatie,
        bouwmethode: store.projectInfo.bouwmethode,
      } : null,
    },
    schedule: {
      name: store.schedule?.name || '',
      projectName: store.schedule?.projectName || '',
      projectNumber: store.schedule?.projectNumber || '',
      client: store.schedule?.client || '',
      author: store.schedule?.author || '',
      description: store.schedule?.description || '',
      status: store.schedule?.status || '',
      algemeneKosten: store.schedule?.algemeneKosten ?? 6,
      winstRisico: store.schedule?.winstRisico ?? 2,
    },
    items: store.items.map(i => ({
      id: i.id,
      code: i.code || '',
      description: i.description || '',
      nr: i.nr,
      rowType: i.rowType,
      quantity: i.quantity,
      unit: i.unit || '',
      unitPrice: i.unitPrice ?? 0,
      total: i.total ?? 0,
      depth: i.depth ?? 0,
      parentId: i.parentId,
      staartPercentage: i.staartPercentage,
    })),
    briefhoofdPath: null as string | null,
  };
}
