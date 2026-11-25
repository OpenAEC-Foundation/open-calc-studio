import React, { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/state/appStore';
import { parseNumericInput } from '@/utils/numericInput';
import { decimalSeparator, formatDecimals, formatNumberForEdit } from '@/utils/formatting';
import {
  MEASUREMENT_FIELDS,
  isClipboardBlock,
  lineValue,
  measurementSum,
  newMeasurementLine,
  parseClipboardBlock,
  pasteIntoMeasurementLines,
  quantityMatchesLines,
  subtotalValue,
} from '@/services/measurement/measurementLines';
import { isValidLineExpression, normalizeLineExpression } from '@/services/measurement/lineExpression';
import type { CostItem, MeasurementField, MeasurementLine } from '@/types/costModel';

/**
 * Meetregels onder een post (#96): een ingesprongen tabelletje met
 * omschrijving, aantal, lengte, breedte, hoogte en subtotaal, zoals de
 * opbouw in Presto. Het tabelletje staat los van de gridnavigatie: het heeft
 * eigen invoervakken, en toetsen en plakken gaan niet door naar het grid.
 * Een blok cellen uit Excel plakken maakt er regels van.
 */

/** Hoogte van één regel in het tabelletje. */
export const MEASUREMENT_LINE_HEIGHT = 22;

/** Weergaven waarin de meetregels onder de post staan: UI-1, UI-2 en Eenvoudig. */
export const MEASUREMENT_VIEWS: ReadonlySet<string> = new Set(['st', 'wpcalc', 'simple']);

/**
 * Hoogte van het tabelletje: kop, regels en voetregel, plus wat lucht.
 * Ingeklapt is het één samenvattingsregel.
 */
export function measurementBlockHeight(item: Pick<CostItem, 'measurementLines' | 'measurementLinesCollapsed'>): number {
  const rows = item.measurementLinesCollapsed ? 1 : (item.measurementLines?.length ?? 0) + 2;
  return rows * MEASUREMENT_LINE_HEIGHT + 6;
}

const DESCRIPTION_MIN = 120;
const FIELD_WIDTH = 64;
const VALUE_WIDTH = 80;
const ACTION_WIDTH = 22;
/** Kolomafstand, binnenrand links/rechts en de accentlijn (zie grid.css). */
const GAP = 4, PAD_LEFT = 8, PAD_RIGHT = 4, BORDER = 2;

/** Smalste breedte waarbij alle kolommen nog passen. */
export const MEASUREMENT_MIN_WIDTH =
  DESCRIPTION_MIN + 4 * FIELD_WIDTH + 2 * VALUE_WIDTH + ACTION_WIDTH + 7 * GAP + PAD_LEFT + PAD_RIGHT + BORDER;
/**
 * Wat er rechts van de kolom Subtotaal nog komt (×-knop, afstand, rand),
 * min de binnenrand van een gridcel. Het tabelletje eindigt zoveel rechts
 * van de kolom Hoeveelheid, zodat het totaal precies onder de hoeveelheid
 * van de post staat.
 */
export const MEASUREMENT_TRAILING = ACTION_WIDTH + GAP + PAD_RIGHT - 6;

/** Sneltoetsen (met Ctrl) die vanuit een meetregel naar de app mogen. */
const APP_SHORTCUTS: ReadonlySet<string> = new Set(['s', 'o', 'n', 'p', '+', '=', '-', '_', '0']);

/** Esc: het vak terugzetten en de grid weer de focus geven, zodat pijltjes werken. */
function leaveToGrid(el: HTMLInputElement): void {
  const grid = el.closest<HTMLElement>('.cost-grid');
  el.blur();
  grid?.focus({ preventScroll: true });
}

/** Getallen: maten op 2 tot 3 decimalen, een aantal zonder decimalen als het heel is. */
const fmt = (v: number | null | undefined): string => (v == null ? '' : formatDecimals(v, 2, 3) || '0');
const fmtCount = (v: number | null | undefined): string => (v == null ? '' : formatDecimals(v, 0, 3) || '0');

interface Props {
  item: CostItem;
  left: number;
  width: number;
}

export const MeasurementLinesBlock: React.FC<Props> = ({ item, left, width }) => {
  const { t } = useTranslation();
  const setMeasurementLines = useAppStore((s) => s.setMeasurementLines);
  const pushHistory = useAppStore((s) => s.pushHistory);
  const toggleMeasurementLines = useAppStore((s) => s.toggleMeasurementLines);
  const lines = item.measurementLines ?? [];
  // Na een vastlegging (blur) en vóór de volgende render is `lines` verouderd;
  // wijzigingen lezen daarom de actuele regels uit de store.
  const current = (): MeasurementLine[] =>
    useAppStore.getState().items.find((i) => i.id === item.id)?.measurementLines ?? [];

  // Melding na plakken (niet te lezen, eenheid weggelaten, ...): geen popup
  // die het werk onderbreekt. Hij hoort bij de regels die het plakken
  // opleverde; veranderen die op welke manier ook (een volgende wijziging,
  // Ctrl+Z, ongedaan maken in het lint), dan verdwijnt hij. Of met ×.
  const [pasteNotice, setPasteNotice] = useState<{ text: string; lines: readonly MeasurementLine[] } | null>(null);
  const notice = pasteNotice && pasteNotice.lines === item.measurementLines ? pasteNotice.text : null;

  const commit = useCallback((next: MeasurementLine[], label: string = t('grid:undo.measurementLines')) => {
    pushHistory(useAppStore.getState().items, label);
    setMeasurementLines(item.id, next);
    setPasteNotice(null);
  }, [item.id, pushHistory, setMeasurementLines, t]);

  const focusCell = (lineId: string, field: string) => {
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLInputElement>(`[data-ml="${item.id}:${lineId}:${field}"]`);
      el?.focus();
      el?.select();
    });
  };

  const updateLine = (index: number, patch: Partial<MeasurementLine>) => {
    const next = current().map((l, i) => (i === index ? { ...l, ...patch } : l));
    commit(next);
  };

  const addLine = (focusField: string = 'description') => {
    // Een regelformule geldt door, zoals in BC3: de nieuwe regel neemt die van de laatste regel over.
    const last = current()[current().length - 1];
    const line = newMeasurementLine(last?.expression && !last.subtotal ? { expression: last.expression } : {});
    commit([...current(), line]);
    focusCell(line.id, focusField);
  };

  /**
   * Regelformule zetten of weghalen (#45), op deze regel en de regels eronder
   * met dezelfde formule (tussentotalen tellen niet mee): een formule geldt
   * tot de volgende, zoals in BC3. `description` vervangt ook de omschrijving
   * van deze regel (de formule werd in dat vak getypt).
   */
  const setExpression = (index: number, expression: string | undefined, description?: string) => {
    const lines = current();
    const old = lines[index]?.expression;
    const next = [...lines];
    for (let i = index; i < lines.length; i++) {
      const l = lines[i];
      if (l.subtotal) continue;
      if (i > index && (old === undefined || l.expression !== old)) break;
      const { expression: _old, ...rest } = l;
      next[i] = {
        ...rest,
        ...(expression ? { expression } : {}),
        ...(i === index && description !== undefined ? { description } : {}),
      };
    }
    commit(next);
  };

  const removeLine = (index: number) => {
    const next = current().filter((_, i) => i !== index);
    // Laatste regel weg: de post houdt de hoeveelheid die er stond.
    commit(next);
  };

  /** Enter: naar hetzelfde vak op de volgende regel; op de laatste regel komt er een bij. */
  const nextLine = (index: number, field: string) => {
    const following = current().slice(index + 1).find((l) => !l.subtotal);
    if (following) focusCell(following.id, field);
    else addLine(field);
  };

  /**
   * Een blok cellen uit Excel geplakt in een vak: regels vanaf deze regel en
   * kolommen vanaf dit vak, in één undo-stap. Een gekoppelde hoeveelheid
   * vraagt eerst, zoals bij het maken van meetregels. Getallen die niet te
   * lezen zijn blijven leeg; een melding onder het tabelletje noemt de
   * regels, en ook weggelaten eenheden, kolommen en een gok op het
   * decimaalteken.
   */
  const pasteBlock = (lineId: string, field: 'description' | MeasurementField, text: string) => {
    const lines = current();
    const index = lines.findIndex((l) => l.id === lineId);
    if (index < 0) return;
    const live = useAppStore.getState().items.find((i) => i.id === item.id);
    if ((live?.excelLink || live?.quantityLink) && !window.confirm(t('grid:measurement.dropLinkConfirm'))) {
      focusCell(lineId, field); // geannuleerd: terug naar het vak
      return;
    }
    const result = pasteIntoMeasurementLines(lines, index, field, parseClipboardBlock(text), decimalSeparator());
    commit(result.lines, t('grid:measurement.pasteUndo'));
    // Naar de eerste regel die het plakken vulde (begon het op een tussentotaal, dan is dat de regel erna).
    focusCell(result.firstLineId ?? lineId, field);
    const parts: string[] = [];
    if (result.invalidLines.length > 0) parts.push(t('grid:measurement.pasteInvalid', { lines: result.invalidLines.join(', ') }));
    if (result.unitLines.length > 0) parts.push(t('grid:measurement.pasteUnits', { lines: result.unitLines.join(', ') }));
    if (result.droppedColumns) parts.push(t('grid:measurement.pasteExtraColumns', { height: t('grid:measurement.height') }));
    if (result.decimalGuess) {
      parts.push(t('grid:measurement.pasteDecimalGuess', { text: result.decimalGuess.text, value: fmt(result.decimalGuess.value) }));
    }
    setPasteNotice(parts.length > 0 ? { text: parts.join(' · '), lines: current() } : null);
  };

  /**
   * Toetsen blijven in het tabelletje: de grid mag ze niet zien, ook niet met
   * Ctrl erbij (Ctrl+C kopieerde anders de rij, Ctrl+Delete wiste de
   * hoeveelheid). Alleen app-sneltoetsen (opslaan, openen, nieuw, afdrukken,
   * zoom) gaan door. Ctrl+Z / Ctrl+Y (en Ctrl+Shift+Z) leggen eerst het vak
   * vast en draaien dan terug, zodat ongedaan maken ook hier werkt.
   */
  const onKeyDown = (e: React.KeyboardEvent) => {
    const ctrl = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (ctrl && (key === 'z' || key === 'y')) {
      e.preventDefault();
      e.stopPropagation();
      (e.target as HTMLElement).blur?.();
      const st = useAppStore.getState();
      const restored = key === 'y' || e.shiftKey ? st.redo() : st.undo();
      if (restored) st.setItems(restored);
      return;
    }
    if (ctrl && APP_SHORTCUTS.has(key)) return;
    e.stopPropagation();
  };

  /** Uitleg bij de regelformule, met de kolomnamen in de taal van de app. */
  const expressionHint = t('grid:measurement.expressionHint', {
    units: t('grid:measurement.count'),
    length: t('grid:measurement.length'),
    width: t('grid:measurement.width'),
    height: t('grid:measurement.height'),
  });

  const columnsTemplate = `minmax(${DESCRIPTION_MIN}px, 1fr) repeat(4, ${FIELD_WIDTH}px) ${VALUE_WIDTH}px ${VALUE_WIDTH}px ${ACTION_WIDTH}px`;
  const sum = measurementSum(lines);
  const collapsed = !!item.measurementLinesCollapsed;
  // Hoeveelheid ≠ som (een bestand van buiten, een oudere versie): niet stil
  // aanpassen, wel laten zien met beide getallen, en één klik neemt de som over.
  const mismatch = !quantityMatchesLines(item) ? (
    <button
      type="button"
      className="measurement-mismatch"
      title={t('grid:measurement.mismatch', { quantity: fmt(item.quantity ?? 0), sum: fmt(sum) })}
      onClick={() => commit(current())}
    >⚠ {fmt(item.quantity ?? 0)} ≠ {fmt(sum)} · {t('grid:measurement.useSum')}</button>
  ) : null;

  // Eigen chevron: klapt alleen de meetregels in, de middelen blijven staan.
  const toggle = (
    <button
      type="button"
      className="measurement-toggle"
      aria-expanded={!collapsed}
      title={t('grid:measurement.toggle')}
      aria-label={t('grid:measurement.toggle')}
      onClick={() => toggleMeasurementLines(item.id)}
    >{collapsed ? '▸' : '▾'}</button>
  );

  const totalCells = (
    <>
      <span className="measurement-mismatch-cell">{mismatch}</span>
      <span className="num">{t('grid:measurement.sum')}</span>
      <span className="num measurement-value measurement-sum">{fmt(sum)}</span>
      <span />
    </>
  );

  return (
    <div
      className={`measurement-block${collapsed ? ' measurement-collapsed' : ''}`}
      style={{ marginLeft: left, width, height: measurementBlockHeight(item) }}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.stopPropagation()}
      onPaste={(e) => e.stopPropagation()}
      data-measurement-for={item.id}
    >
      {collapsed ? (
        <div className="measurement-row measurement-summary" style={{ gridTemplateColumns: columnsTemplate }}>
          <span className="measurement-title">{toggle}{t('grid:measurement.linesCount', { count: lines.length })}</span>
          {totalCells}
        </div>
      ) : (<>
      <div className="measurement-row measurement-head" style={{ gridTemplateColumns: columnsTemplate }}>
        <span className="measurement-title">{toggle}{t('grid:measurement.description')}</span>
        <span className="num">{t('grid:measurement.count')}</span>
        <span className="num">{t('grid:measurement.length')}</span>
        <span className="num">{t('grid:measurement.width')}</span>
        <span className="num">{t('grid:measurement.height')}</span>
        <span className="num">{t('grid:measurement.partial')}</span>
        <span className="num">{t('grid:measurement.subtotal')}</span>
        <span />
      </div>
      {lines.map((line, index) => (
        <div
          key={line.id}
          className={`measurement-row${line.subtotal ? ' measurement-subtotal' : ''}${lineValue(line) < 0 ? ' measurement-negative' : ''}`}
          style={{ gridTemplateColumns: columnsTemplate }}
        >
          <span className="measurement-desc">
            {!line.subtotal && line.expression && (
              <ExpressionCell
                dataKey={`${item.id}:${line.id}:expression`}
                expression={line.expression}
                continued={previousExpression(lines, index) === line.expression}
                hint={expressionHint}
                onCommit={(expr) => setExpression(index, expr)}
              />
            )}
            <TextCell
              dataKey={`${item.id}:${line.id}:description`}
              value={line.description}
              placeholder={line.subtotal ? t('grid:measurement.subtotal') : ''}
              title={line.subtotal ? undefined : expressionHint}
              ariaLabel={t('grid:measurement.description')}
              onCommit={(v) => {
                // "=a*b*c/2" in de omschrijving: een regelformule, geen tekst.
                if (!line.subtotal && v.trim().startsWith('=')) {
                  const expr = normalizeLineExpression(v);
                  if (expr) { setExpression(index, expr, ''); return; }
                }
                if (v !== line.description) updateLine(index, { description: v });
              }}
              onEnter={() => nextLine(index, 'description')}
              onPasteBlock={(text) => pasteBlock(line.id, 'description', text)}
            />
          </span>
          {MEASUREMENT_FIELDS.map((field) => (line.subtotal
            ? <span key={field} />
            : (
              <NumberCell
                key={field}
                dataKey={`${item.id}:${line.id}:${field}`}
                value={line[field]}
                format={field === 'count' ? fmtCount : fmt}
                formula={line.formulas?.[field]}
                ariaLabel={t(`grid:measurement.${field}`)}
                onCommit={(value, formula) => {
                  if (value === line[field] && formula === line.formulas?.[field]) return;
                  const formulas = { ...(line.formulas ?? {}) };
                  if (formula) formulas[field] = formula; else delete formulas[field];
                  updateLine(index, {
                    [field]: value,
                    formulas: Object.keys(formulas).length > 0 ? formulas : undefined,
                  } as Partial<MeasurementLine>);
                }}
                onEnter={() => nextLine(index, field)}
                onPasteBlock={(text) => pasteBlock(line.id, field, text)}
              />
            )))}
          {/* Parcial: wat de regel oplevert; Subtotal: alleen op een tussentotaalregel. */}
          <span className="num measurement-value">{line.subtotal ? '' : fmt(lineValue(line))}</span>
          <span className="num measurement-value">{line.subtotal ? fmt(subtotalValue(lines, index)) : ''}</span>
          <button
            type="button"
            className="measurement-delete"
            title={t('grid:measurement.deleteLine')}
            aria-label={t('grid:measurement.deleteLine')}
            onClick={() => removeLine(index)}
          >×</button>
        </div>
      ))}
      <div className="measurement-row measurement-foot" style={{ gridTemplateColumns: columnsTemplate }}>
        {/* Een melding na plakken krijgt de breedte tot het totaal, tenzij de
            waarschuwing hoeveelheid ≠ som daar staat. */}
        <span className={`measurement-foot-start${notice && !mismatch ? ' measurement-foot-wide' : ''}`}>
          <button type="button" className="measurement-add" onClick={() => addLine()}>
            {t('grid:measurement.addLine')}
          </button>
          {/* Live-gebied staat er altijd, zodat een schermlezer de melding voorleest zodra hij verschijnt. */}
          <span className="measurement-notice-region" role="status">
            {notice && (
              <span className="measurement-notice" title={notice}>
                <span className="measurement-notice-text">⚠ {notice}</span>
                <button
                  type="button"
                  className="measurement-notice-close"
                  title={t('grid:measurement.noticeDismiss')}
                  aria-label={t('grid:measurement.noticeDismiss')}
                  onClick={() => setPasteNotice(null)}
                >×</button>
              </span>
            )}
          </span>
        </span>
        {notice && !mismatch ? (
          <>
            <span className="num">{t('grid:measurement.sum')}</span>
            <span className="num measurement-value measurement-sum">{fmt(sum)}</span>
            <span />
          </>
        ) : totalCells}
      </div>
      </>)}
    </div>
  );
};

interface CellProps {
  dataKey: string;
  ariaLabel: string;
  onEnter: () => void;
  /** Een geplakt blok cellen (tab of meer regels); één waarde plakt de browser zelf. */
  onPasteBlock: (text: string) => void;
}

/**
 * Plakken in een vak: is het een blok cellen, dan neemt het tabelletje het
 * over. Het vak legt dan niets vast (anders schreef het bij verlaten zijn
 * oude tekst over het geplakte heen) en verliest de focus.
 */
function pasteHandler(cancelled: React.MutableRefObject<boolean>, onPasteBlock: (text: string) => void) {
  return (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData?.getData('text/plain') ?? '';
    if (!isClipboardBlock(text)) return;
    e.preventDefault();
    cancelled.current = true;
    e.currentTarget.blur();
    onPasteBlock(text);
  };
}

/** Formule van de dichtstbijzijnde gewone regel erboven (tussentotalen overgeslagen). */
function previousExpression(lines: readonly MeasurementLine[], index: number): string | undefined {
  for (let i = index - 1; i >= 0; i--) if (!lines[i].subtotal) return lines[i].expression;
  return undefined;
}

/**
 * Regelformule als knopje vóór de omschrijving (#45). Op de regel waar hij
 * begint staat de formule zelf, op de regels eronder met dezelfde formule
 * alleen ƒ. Klikken maakt er een invoervak van: Enter of verlaten legt
 * vast, leeg haalt de formule weg, Esc zet terug. Een ongeldige formule
 * kleurt het vak rood en wordt niet vastgelegd.
 */
const ExpressionCell: React.FC<{
  dataKey: string;
  expression: string;
  continued: boolean;
  hint: string;
  onCommit: (expression: string | undefined) => void;
}> = ({ dataKey, expression, continued, hint, onCommit }) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);
  const label = t('grid:measurement.expression');
  if (draft === null) {
    return (
      <button
        type="button"
        className={`measurement-expr${continued ? ' measurement-expr-cont' : ''}`}
        data-ml={dataKey}
        title={t(continued ? 'grid:measurement.expressionContinued' : 'grid:measurement.expressionEdit', { expression })}
        aria-label={`${label}: ${expression}`}
        onClick={() => { cancelled.current = false; setDraft(expression); }}
      >ƒ{continued ? '' : ` ${expression}`}</button>
    );
  }
  const text = draft.trim();
  const invalid = text !== '' && !isValidLineExpression(text);
  const finish = () => {
    if (!cancelled.current && !invalid) {
      if (text === '') onCommit(undefined);
      else {
        const normalized = normalizeLineExpression(text);
        if (normalized && normalized !== expression) onCommit(normalized);
      }
    }
    setDraft(null);
  };
  return (
    <input
      className="measurement-input measurement-expr-input"
      data-ml={dataKey}
      aria-label={label}
      aria-invalid={invalid}
      title={hint}
      autoFocus
      value={draft}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={finish}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); if (!invalid) e.currentTarget.blur(); }
        else if (e.key === 'Escape') { e.preventDefault(); cancelled.current = true; e.currentTarget.blur(); }
      }}
    />
  );
};

/** Tekstvak dat pas bij verlaten of Enter vastlegt; Esc zet terug. */
const TextCell: React.FC<CellProps & { value: string; placeholder?: string; title?: string; onCommit: (v: string) => void }> = ({ dataKey, ariaLabel, value, placeholder, title, onCommit, onEnter, onPasteBlock }) => {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);
  return (
    <input
      className="measurement-input"
      data-ml={dataKey}
      aria-label={ariaLabel}
      placeholder={placeholder}
      title={title}
      value={draft ?? value}
      onFocus={() => { cancelled.current = false; setDraft(value); }}
      onChange={(e) => setDraft(e.target.value)}
      onPaste={pasteHandler(cancelled, onPasteBlock)}
      onBlur={() => { if (draft !== null && !cancelled.current) onCommit(draft); setDraft(null); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); onEnter(); }
        else if (e.key === 'Escape') { cancelled.current = true; leaveToGrid(e.currentTarget); }
      }}
    />
  );
};

/**
 * Getalvak: toont het getal; tijdens bewerken de formule als die er is.
 * Een invoer met `=` wordt als formule bewaard (#45 bouwt daarop verder),
 * ongeldige invoer laat de oude waarde staan.
 */
const NumberCell: React.FC<CellProps & {
  value: number | null;
  format: (v: number | null | undefined) => string;
  formula?: string;
  onCommit: (value: number | null, formula: string | undefined) => void;
}> = ({ dataKey, ariaLabel, value, format, formula, onCommit, onEnter, onPasteBlock }) => {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);
  const editText = formula ?? formatNumberForEdit(value);
  const finish = () => {
    if (draft === null || cancelled.current) { setDraft(null); return; }
    const text = draft.trim();
    setDraft(null);
    if (text === editText.trim()) return;
    if (text === '') { onCommit(null, undefined); return; }
    const parsed = parseNumericInput(text);
    if (parsed === null || !Number.isFinite(parsed)) return;
    onCommit(parsed, text.startsWith('=') ? text : undefined);
  };
  return (
    <input
      className="measurement-input num"
      data-ml={dataKey}
      aria-label={ariaLabel}
      inputMode="decimal"
      title={formula}
      value={draft ?? (value == null ? '' : format(value))}
      onFocus={() => { cancelled.current = false; setDraft(editText); }}
      onChange={(e) => setDraft(e.target.value)}
      onPaste={pasteHandler(cancelled, onPasteBlock)}
      onBlur={finish}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); onEnter(); }
        else if (e.key === 'Escape') { cancelled.current = true; leaveToGrid(e.currentTarget); }
      }}
    />
  );
};
