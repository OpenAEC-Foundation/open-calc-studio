import { uiText } from '../../i18n/uiText';
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

// De begrotingscontext gaat via stdin (geen lengtelimiet), dus de hele
// begroting kan mee — de assistent moet immers alle regels kennen om vragen
// te beantwoorden. Ruime veiligheidsbovengrens tegen pathologische gevallen.
const MAX_CONTEXT_REGELS = 2000;

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
- {"type":"add_regel","onderNr":"21.01","omschrijving":"Beton C30","aantal":12,"eenheid":"m³","prijs":145,"resourceType":"materiaal"} — resourceType: arbeid | materiaal | materieel | onderaannemer | overig. Voor uren-regels: eenheid "uur" en tariefgroep meegeven; het loon wordt automatisch via de tariefgroep gerekend (geef GEEN prijs op).
- {"type":"verwijder","nr":"21.01.02"}

Regels: alleen een acties-blok opnemen als de gebruiker echt een wijziging vraagt. Leg in gewone tekst kort uit wat je doet. Bedragen zijn excl. btw. Verzin geen nr's die niet in de lijst staan.`;

// ── 2. Parsen ───────────────────────────────────────────────────────────

export interface AssistantActie {
  type: string;
  [key: string]: unknown;
}

function normaliseerEenheid(value: unknown): CostItem['unit'] {
  const unit = String(value ?? 'st').trim();
  return ({ m1: 'm', m2: 'm²', m3: 'm³' } as Record<string, CostItem['unit']>)[unit] ?? unit as CostItem['unit'];
}

/** Reject a malformed or stale AI batch before changing any budget row. */
export function validateActies(acties: AssistantActie[], items: CostItem[]): string[] {
  const errors: string[] = [];
  const byNr = (nr: unknown) => items.find(i => i.nr === String(nr ?? '').trim());
  const units = new Set(['st', 'm', 'm²', 'm³', 'kg', 'ton', 'uur', 'dgn', 'km', 'keer', 'ls', 'week', 'mnd', 'post', '%', 'pm']);
  const resources = new Set(['arbeid', 'materiaal', 'materieel', 'onderaannemer', 'overig']);
  const numeric = (value: unknown) => value == null || value === '' || (typeof value === 'number' && Number.isFinite(value));
  if (acties.length > 100) return [uiText("chat.actions.tooMany", "Too many proposed changes (maximum 100).")];
  acties.forEach((a, index) => {
    const prefix = uiText("chat.actions.action", "Action {{p0}}", { p0: index + 1 });
    if (!a || typeof a !== 'object') { errors.push(uiText("chat.actions.invalid", "{{p0}}: invalid action.", { p0: prefix })); return; }
    const parent = byNr(a.onderNr);
    switch (a.type) {
      case 'update':
        if (!byNr(a.nr)) errors.push(uiText("chat.actions.missing", "{{p0}}: no. {{p1}} does not exist.", { p0: prefix, p1: String(a.nr) }));
        if (!VELD_MAP[String(a.veld ?? '').toLowerCase()]) errors.push(uiText("chat.actions.field", "{{p0}}: unknown field.", { p0: prefix }));
        if (['aantal', 'hoeveelheid', 'prijs', 'norm'].includes(String(a.veld).toLowerCase()) && !numeric(a.waarde)) errors.push(uiText("chat.actions.finite", "{{p0}}: the value must be a finite number.", { p0: prefix }));
        if (String(a.veld).toLowerCase() === 'eenheid' && !units.has(normaliseerEenheid(a.waarde))) errors.push(uiText("chat.actions.unit", "{{p0}}: unknown unit.", { p0: prefix }));
        if (String(a.veld).toLowerCase() === 'tariefgroep' && !['A', 'B', 'C'].includes(String(a.waarde))) errors.push(uiText("chat.actions.rate", "{{p0}}: unknown rate group.", { p0: prefix }));
        if (['omschrijving', 'code'].includes(String(a.veld).toLowerCase()) && typeof a.waarde !== 'string') errors.push(uiText("chat.actions.text", "{{p0}}: text value missing.", { p0: prefix }));
        break;
      case 'add_hoofdstuk':
        if (typeof a.omschrijving !== 'string' || !a.omschrijving.trim()) errors.push(uiText("chat.actions.description", "{{p0}}: description missing.", { p0: prefix }));
        break;
      case 'add_post':
        if (!parent || parent.rowType !== 'chapter') errors.push(uiText("chat.actions.parentChapter", "{{p0}}: select an existing parent chapter.", { p0: prefix }));
        if (typeof a.omschrijving !== 'string' || !a.omschrijving.trim()) errors.push(uiText("chat.actions.description", "{{p0}}: description missing.", { p0: prefix }));
        if (!numeric(a.aantal)) errors.push(uiText("chat.actions.quantity", "{{p0}}: quantity must be a finite number.", { p0: prefix }));
        if (a.eenheid != null && !units.has(normaliseerEenheid(a.eenheid))) errors.push(uiText("chat.actions.unit", "{{p0}}: unknown unit.", { p0: prefix }));
        break;
      case 'add_regel':
        if (!parent || !['begrotingspost', 'bewakingspost'].includes(parent.rowType)) errors.push(uiText("chat.actions.parentItem", "{{p0}}: select an existing parent estimate item.", { p0: prefix }));
        if (typeof a.omschrijving !== 'string' || !a.omschrijving.trim()) errors.push(uiText("chat.actions.description", "{{p0}}: description missing.", { p0: prefix }));
        if (!numeric(a.aantal) || !numeric(a.prijs) || !numeric(a.norm)) errors.push(uiText("chat.actions.numbers", "{{p0}}: quantity, price and labour norm must be finite numbers.", { p0: prefix }));
        if (a.eenheid != null && !units.has(normaliseerEenheid(a.eenheid))) errors.push(uiText("chat.actions.unit", "{{p0}}: unknown unit.", { p0: prefix }));
        if (a.resourceType != null && !resources.has(String(a.resourceType))) errors.push(uiText("chat.actions.resource", "{{p0}}: unknown resource type.", { p0: prefix }));
        if (a.tariefgroep != null && !['A', 'B', 'C'].includes(String(a.tariefgroep).toUpperCase())) errors.push(uiText("chat.actions.rate", "{{p0}}: unknown rate group.", { p0: prefix }));
        break;
      case 'verwijder':
        if (!byNr(a.nr)) errors.push(uiText("chat.actions.missing", "{{p0}}: no. {{p1}} does not exist.", { p0: prefix, p1: String(a.nr) }));
        break;
      default:
        errors.push(uiText("chat.actions.unknown", "{{p0}}: unknown action {{p1}}.", { p0: prefix, p1: String(a.type) }));
    }
  });
  return errors;
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

/** Small offline grammar for a common estimating command; all other freeform
 * requests still use the configured AI provider. The result uses the same
 * review and validation path as an AI proposal. */
export function parseLocalBudgetCommand(text: string): AssistantActie[] | null {
  const match = text.trim().match(/^voeg\s+onder\s+(\d+(?:\.\d+)*)\s+(?:een\s+)?regel\s+toe\s*:\s*(\d+(?:[.,]\d+)?)\s+(\S+)\s+(.+?)\s+(?:à|tegen)\s*€?\s*(\d+(?:[.,]\d+)?)\s*$/i);
  const parsed = match ?? text.trim().match(/^add\s+under\s+(\d+(?:\.\d+)*)\s+(?:a\s+)?line\s*:\s*(\d+(?:[.,]\d+)?)\s+(\S+)\s+(.+?)\s+(?:at|@)\s*€?\s*(\d+(?:[.,]\d+)?)\s*$/i);
  if (!parsed) return null;
  const [, onderNr, aantal, eenheid, omschrijving, prijs] = parsed;
  const unit = normaliseerEenheid(eenheid);
  // Hourly labor uses the tariff-group model, so a free price here would be
  // ignored by applyActies. Leave that case to the full assistant instead.
  if (unit === 'uur') return null;
  return [{ type: 'add_regel', onderNr, aantal: Number(aantal.replace(',', '.')), eenheid: unit, omschrijving: omschrijving.trim(), prijs: Number(prijs.replace(',', '.')) }];
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
  const errors = validateActies(acties, store.items);
  if (errors.length) return errors.map(error => `✖ ${error}`);
  const before = { items: store.items, documents: store.documents, undoStack: store.undoStack, redoStack: store.redoStack };
  store.pushHistory(store.items, uiText("chat.actions.history", "Estimating assistant"));

  const tarieven = store.schedule.tarieven ?? { A: 66, B: 46, C: 82 };
  const vindOpNr = (nr: unknown): CostItem | undefined =>
    useAppStore.getState().items.find((i) => i.nr === String(nr ?? '').trim());

  for (const actie of acties) {
    try {
      switch (actie.type) {
        case 'update': {
          const item = vindOpNr(actie.nr);
          if (!item) throw new Error(uiText("diagnostics.assistantActions.noWasNotFound", "No. {{p0}} was not found", { p0: actie.nr }));
          const veld = VELD_MAP[String(actie.veld ?? '').toLowerCase()];
          if (!veld) throw new Error(uiText("diagnostics.assistantActions.unknownField", "Unknown field \"{{p0}}\"", { p0: actie.veld }));
          let waarde: unknown = actie.waarde;
          if (veld === 'unit') waarde = normaliseerEenheid(waarde);
          if (['quantity', 'normUnitPrice', 'normQuantity'].includes(veld)) {
            waarde = waarde == null || waarde === '' ? null : Number(waarde);
            if (waarde !== null && isNaN(waarde as number)) throw new Error(uiText("diagnostics.assistantActions.theValueIsNotANumber", "The value is not a number"));
          }
          useAppStore.getState().updateItem(item.id, veld, waarde as never);
          resultaten.push(`✔ ${actie.nr}: ${String(actie.veld)} → ${actie.waarde}`);
          break;
        }
        case 'add_hoofdstuk': {
          const item = nieuwItem('chapter', null, {
            code: String(actie.code ?? ''),
            description: String(actie.omschrijving ?? uiText("chat.actions.newChapter", "New chapter")),
          });
          useAppStore.getState().setItems([...useAppStore.getState().items, item]);
          resultaten.push(uiText("chat.actions.chapterAdded", "✔ Chapter {{p0}} \"{{p1}}\" added", { p0: item.code, p1: item.description }));
          break;
        }
        case 'add_post': {
          const ouder = vindOpNr(actie.onderNr);
          if (!ouder) throw new Error(uiText("diagnostics.assistantActions.parentNoWasNotFound", "Parent no. {{p0}} was not found", { p0: actie.onderNr }));
          const item = nieuwItem('begrotingspost', ouder.id, {
            description: String(actie.omschrijving ?? uiText("chat.actions.newPost", "New item")),
            quantity: actie.aantal != null ? Number(actie.aantal) : null,
            unit: normaliseerEenheid(actie.eenheid),
          });
          useAppStore.getState().setItems([...useAppStore.getState().items, item]);
          resultaten.push(uiText("chat.actions.postAdded", "✔ Item \"{{p0}}\" added under {{p1}}", { p0: item.description, p1: actie.onderNr }));
          break;
        }
        case 'add_regel': {
          const ouder = vindOpNr(actie.onderNr);
          if (!ouder) throw new Error(uiText("diagnostics.assistantActions.parentNoWasNotFound", "Parent no. {{p0}} was not found", { p0: actie.onderNr }));
          const eenheid = normaliseerEenheid(actie.eenheid);
          const groep = (String(actie.tariefgroep ?? 'A').toUpperCase() as 'A' | 'B' | 'C');
          const isUren = eenheid.toLowerCase() === 'uur';
          // Uur-regels volgen de vaste calculatieregels: norm 1, loon via de
          // tariefgroep, géén materiaalprijs — anders belandt loon in de
          // materiaalkolom.
          const item = nieuwItem('regel', ouder.id, {
            description: String(actie.omschrijving ?? uiText("chat.actions.newLine", "New line")),
            quantity: actie.aantal != null ? Number(actie.aantal) : null,
            unit: eenheid,
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
          resultaten.push(uiText("chat.actions.lineAdded", "✔ Line \"{{p0}}\" added under {{p1}}", { p0: item.description, p1: actie.onderNr }));
          break;
        }
        case 'verwijder': {
          const item = vindOpNr(actie.nr);
          if (!item) throw new Error(uiText("diagnostics.assistantActions.noWasNotFound", "No. {{p0}} was not found", { p0: actie.nr }));
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
          resultaten.push(uiText("chat.actions.deleted", "✔ {{p0}} \"{{p1}}\" removed (rows: {{p2}})", { p0: actie.nr, p1: item.description, p2: weg.size, p3: weg.size === 1 ? '' : 's' }));
          break;
        }
        default:
          throw new Error(uiText("chat.actions.unknownAction", "Unknown action \"{{p0}}\"", { p0: actie.type }));
      }
    } catch (e) {
      resultaten.push(`✖ ${actie.type}: ${(e as Error).message}`);
    }
  }

  const failed = resultaten.filter(result => result.startsWith('✖'));
  if (failed.length) {
    useAppStore.setState(before);
    return [...failed, uiText("chat.actions.none", "✖ No changes applied.")];
  }
  useAppStore.getState().recalculate();
  const after = useAppStore.getState();
  if (after.activeDocumentId) after.updateDocument(after.activeDocumentId, { isModified: true });
  return resultaten;
}
