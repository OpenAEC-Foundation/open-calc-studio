import type { CostItem, CostSchedule, RowType } from '@/types/costModel';
import { useAppStore } from '@/state/appStore';

/**
 * Calculatieassistent — de brug tussen het taalmodel en het geopende document.
 *
 * 1) buildBudgetContext geeft het model een compacte, genummerde weergave van
 *    de actieve begroting (Nr is de verwijssleutel).
 * 2) Het model mag in zijn antwoord één ```ocs-acties```-blok teruggeven met
 *    wijzigingen; parseActies haalt dat eruit.
 * 3) applyActies voert ze uit op de store — met undo-historie, de vaste
 *    regels voor uur-regels (norm 1 + tariefgroep + loon, nooit als
 *    materiaalprijs) en een herberekening achteraf.
 */

// ── 1. Context ──────────────────────────────────────────────────────────

const MAX_CONTEXT_REGELS = 150;

export function buildBudgetContext(schedule: CostSchedule, items: CostItem[]): string {
  const tarieven = schedule.tarieven ?? { A: 66, B: 46, C: 82 };
  const zichtbaar = items.filter((i) => !i.rowType.startsWith('staart_'));
  const kostprijs = zichtbaar
    .filter((i) => i.parentId === null)
    .reduce((s, i) => s + (i.total ?? 0), 0);

  const fmt = (v: number | null | undefined) =>
    v == null || v === 0 ? '' : String(Math.round(v * 100) / 100);

  const regels = zichtbaar.slice(0, MAX_CONTEXT_REGELS).map((i) => {
    const kolommen = [
      i.nr || '?',
      i.rowType,
      i.description,
      [fmt(i.quantity), i.unit ?? ''].filter(Boolean).join(' '),
      i.rowType === 'regel' ? `prijs=${fmt(i.normUnitPrice)} loon/eh=${fmt(i.laborPrice)} norm=${fmt(i.normQuantity)} tarief=${i.tariefGroep ?? ''} soort=${i.resourceType ?? ''}` : '',
      `totaal=${fmt(i.total)}`,
    ];
    return kolommen.filter(Boolean).join(' | ');
  });
  const rest = zichtbaar.length - MAX_CONTEXT_REGELS;
  if (rest > 0) regels.push(`(… nog ${rest} regels niet getoond)`);

  return [
    `Project: ${schedule.projectName || schedule.name || '(naamloos)'}`,
    `Kostprijs (excl. staart/btw): ${Math.round(kostprijs)}`,
    `Tarieven per uur: A=${tarieven.A} B=${tarieven.B} C=${tarieven.C}`,
    '',
    'Begrotingsregels (Nr | type | omschrijving | hoeveelheid | details | totaal):',
    ...regels,
  ].join('\n');
}

/** Protocol-uitleg voor in de system prompt. */
export const ACTIE_PROTOCOL = `
Je kunt de begroting WIJZIGEN. Doe dat door in je antwoord precies één blok op te nemen:

\`\`\`ocs-acties
{"acties":[ ... ]}
\`\`\`

Toegestane acties (verwijs altijd met het exacte "nr" uit de begrotingsregels):
- {"type":"update","nr":"21.01.01","veld":"aantal","waarde":14} — velden: aantal, prijs (materiaal/inkoop per eenheid), omschrijving, eenheid, norm (uren per eenheid), tariefgroep (A/B/C), code
- {"type":"add_hoofdstuk","code":"32","omschrijving":"Trappen"}
- {"type":"add_post","onderNr":"21","omschrijving":"Fundering"}
- {"type":"add_regel","onderNr":"21.01","omschrijving":"Beton C30","aantal":12,"eenheid":"m3","prijs":145,"resourceType":"materiaal"} — resourceType: arbeid | materiaal | materieel | onderaannemer | overig. Voor uren-regels: eenheid "uur" en tariefgroep meegeven; het loon wordt automatisch via de tariefgroep gerekend (geef GEEN prijs op).
- {"type":"verwijder","nr":"21.01.02"}

Regels: alleen een acties-blok opnemen als de gebruiker echt een wijziging vraagt. Leg in gewone tekst kort uit wat je doet. Bedragen zijn excl. btw. Verzin geen nr's die niet in de lijst staan.`;

// ── 2. Parsen ───────────────────────────────────────────────────────────

export interface AssistantActie {
  type: string;
  [key: string]: unknown;
}

export function parseActies(text: string): { acties: AssistantActie[]; cleanText: string } {
  const match = text.match(/```(?:ocs-acties|json)?\s*\n?(\{[\s\S]*?\})\s*```/);
  if (!match) return { acties: [], cleanText: text };
  try {
    const parsed = JSON.parse(match[1]);
    if (!Array.isArray(parsed?.acties)) return { acties: [], cleanText: text };
    const cleanText = text.replace(match[0], '').trim();
    return { acties: parsed.acties as AssistantActie[], cleanText };
  } catch {
    return { acties: [], cleanText: text };
  }
}

// ── 3. Uitvoeren ────────────────────────────────────────────────────────

const VELD_MAP: Record<string, keyof CostItem> = {
  aantal: 'quantity',
  hoeveelheid: 'quantity',
  prijs: 'normUnitPrice',
  omschrijving: 'description',
  eenheid: 'unit',
  norm: 'normQuantity',
  tariefgroep: 'tariefGroep',
  code: 'code',
};

function nieuwItem(rowType: RowType, parentId: string | null, overrides: Partial<CostItem>): CostItem {
  return {
    id: crypto.randomUUID(),
    parentId,
    sortOrder: 999999, // normalisatie zet hem netjes achteraan bij zijn ouder
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
    ifcGuid: crypto.randomUUID(),
    rowType,
    staartPercentage: null,
    nr: '',
    normQuantity: null,
    normFactor: null,
    normDivisor: null,
    normUnitPrice: null,
    resourceType: null,
    resourceLibraryId: null,
    verrekenbaar: rowType === 'chapter' ? 'V' : null,
    tariefGroep: null,
    ...overrides,
  } as CostItem;
}

/** Voer de acties uit op het actieve document. Geeft per actie een resultaatregel. */
export function applyActies(acties: AssistantActie[]): string[] {
  const resultaten: string[] = [];
  if (acties.length === 0) return resultaten;

  const store = useAppStore.getState();
  store.pushHistory(store.items, 'Calculatieassistent');

  const tarieven = store.schedule.tarieven ?? { A: 66, B: 46, C: 82 };
  const vindOpNr = (nr: unknown): CostItem | undefined =>
    useAppStore.getState().items.find((i) => i.nr === String(nr ?? '').trim());

  for (const actie of acties) {
    try {
      switch (actie.type) {
        case 'update': {
          const item = vindOpNr(actie.nr);
          if (!item) throw new Error(`nr ${actie.nr} niet gevonden`);
          const veld = VELD_MAP[String(actie.veld ?? '').toLowerCase()];
          if (!veld) throw new Error(`onbekend veld "${actie.veld}"`);
          let waarde: unknown = actie.waarde;
          if (['quantity', 'normUnitPrice', 'normQuantity'].includes(veld)) {
            waarde = waarde == null || waarde === '' ? null : Number(waarde);
            if (waarde !== null && isNaN(waarde as number)) throw new Error('waarde is geen getal');
          }
          useAppStore.getState().updateItem(item.id, veld, waarde as never);
          resultaten.push(`✔ ${actie.nr}: ${String(actie.veld)} → ${actie.waarde}`);
          break;
        }
        case 'add_hoofdstuk': {
          const item = nieuwItem('chapter', null, {
            code: String(actie.code ?? ''),
            description: String(actie.omschrijving ?? 'Nieuw hoofdstuk'),
          });
          useAppStore.getState().setItems([...useAppStore.getState().items, item]);
          resultaten.push(`✔ Hoofdstuk ${item.code} "${item.description}" toegevoegd`);
          break;
        }
        case 'add_post': {
          const ouder = vindOpNr(actie.onderNr);
          if (!ouder) throw new Error(`onderNr ${actie.onderNr} niet gevonden`);
          const item = nieuwItem('begrotingspost', ouder.id, {
            description: String(actie.omschrijving ?? 'Nieuwe post'),
            quantity: actie.aantal != null ? Number(actie.aantal) : null,
            unit: (actie.eenheid as CostItem['unit']) ?? 'st',
          });
          useAppStore.getState().setItems([...useAppStore.getState().items, item]);
          resultaten.push(`✔ Post "${item.description}" toegevoegd onder ${actie.onderNr}`);
          break;
        }
        case 'add_regel': {
          const ouder = vindOpNr(actie.onderNr);
          if (!ouder) throw new Error(`onderNr ${actie.onderNr} niet gevonden`);
          const eenheid = String(actie.eenheid ?? 'st');
          const groep = (String(actie.tariefgroep ?? 'A').toUpperCase() as 'A' | 'B' | 'C');
          const isUren = eenheid.toLowerCase() === 'uur';
          // Uur-regels volgen de vaste calculatieregels: norm 1, loon via de
          // tariefgroep, géén materiaalprijs — anders belandt loon in de
          // materiaalkolom.
          const item = nieuwItem('regel', ouder.id, {
            description: String(actie.omschrijving ?? 'Nieuwe regel'),
            quantity: actie.aantal != null ? Number(actie.aantal) : null,
            unit: eenheid as CostItem['unit'],
            ...(isUren
              ? {
                  normQuantity: 1,
                  tariefGroep: groep,
                  laborPrice: tarieven[groep] ?? 66,
                  normUnitPrice: null,
                  resourceType: 'arbeid',
                }
              : {
                  normUnitPrice: actie.prijs != null ? Number(actie.prijs) : null,
                  normQuantity: actie.norm != null ? Number(actie.norm) : null,
                  tariefGroep: actie.tariefgroep != null ? groep : null,
                  laborPrice: actie.norm != null && actie.tariefgroep != null ? (tarieven[groep] ?? 66) * Number(actie.norm) : null,
                  resourceType: (actie.resourceType as CostItem['resourceType']) ?? null,
                }),
          });
          useAppStore.getState().setItems([...useAppStore.getState().items, item]);
          resultaten.push(`✔ Regel "${item.description}" toegevoegd onder ${actie.onderNr}`);
          break;
        }
        case 'verwijder': {
          const item = vindOpNr(actie.nr);
          if (!item) throw new Error(`nr ${actie.nr} niet gevonden`);
          // Verwijder inclusief alle afstammelingen
          const huidige = useAppStore.getState().items;
          const weg = new Set<string>([item.id]);
          let groeit = true;
          while (groeit) {
            groeit = false;
            for (const i of huidige) {
              if (i.parentId && weg.has(i.parentId) && !weg.has(i.id)) {
                weg.add(i.id);
                groeit = true;
              }
            }
          }
          useAppStore.getState().setItems(huidige.filter((i) => !weg.has(i.id)));
          resultaten.push(`✔ ${actie.nr} "${item.description}" verwijderd (${weg.size} regel${weg.size === 1 ? '' : 's'})`);
          break;
        }
        default:
          throw new Error(`onbekende actie "${actie.type}"`);
      }
    } catch (e) {
      resultaten.push(`✖ ${actie.type}: ${(e as Error).message}`);
    }
  }

  useAppStore.getState().recalculate();
  return resultaten;
}
