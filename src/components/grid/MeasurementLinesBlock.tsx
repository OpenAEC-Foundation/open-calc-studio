import React, { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/state/appStore';
import { parseNumericInput } from '@/utils/numericInput';
import { formatDecimals, formatNumberForEdit } from '@/utils/formatting';
import {
  MEASUREMENT_FIELDS,
  lineValue,
  measurementSum,
  newMeasurementLine,
  quantityMatchesLines,
  subtotalValue,
} from '@/services/measurement/measurementLines';
import type { CostItem, MeasurementLine } from '@/types/costModel';

/**
 * Meetregels onder een post (#96): een ingesprongen tabelletje met
 * omschrijving, aantal, lengte, breedte, hoogte en subtotaal, zoals de
 * opbouw in Presto. Het tabelletje staat los van de gridnavigatie: het heeft
 * eigen invoervakken, en toetsen gaan niet door naar het grid.
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

  const commit = useCallback((next: MeasurementLine[]) => {
    pushHistory(useAppStore.getState().items, t('grid:undo.measurementLines'));
    setMeasurementLines(item.id, next);
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
    const line = newMeasurementLine();
    commit([...current(), line]);
    focusCell(line.id, focusField);
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
   * Toetsen blijven in het tabelletje (de grid mag ze niet als navigatie
   * zien), behalve sneltoetsen: Ctrl+S en dergelijke gaan naar de app.
   * Ctrl+Z / Ctrl+Y legt eerst het vak vast en draait dan terug, zodat
   * ongedaan maken ook hier werkt. Kopiëren en plakken blijven in het vak.
   */
  const onKeyDown = (e: React.KeyboardEvent) => {
    const ctrl = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (ctrl && (key === 'z' || key === 'y')) {
      e.preventDefault();
      e.stopPropagation();
      (e.target as HTMLElement).blur?.();
      const st = useAppStore.getState();
      const restored = key === 'z' ? st.undo() : st.redo();
      if (restored) st.setItems(restored);
      return;
    }
    if (ctrl || e.altKey) return;
    e.stopPropagation();
  };

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
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
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
          <TextCell
            dataKey={`${item.id}:${line.id}:description`}
            value={line.description}
            placeholder={line.subtotal ? t('grid:measurement.subtotal') : ''}
            ariaLabel={t('grid:measurement.description')}
            onCommit={(v) => { if (v !== line.description) updateLine(index, { description: v }); }}
            onEnter={() => nextLine(index, 'description')}
          />
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
        <span>
          <button type="button" className="measurement-add" onClick={() => addLine()}>
            {t('grid:measurement.addLine')}
          </button>
        </span>
        {totalCells}
      </div>
      </>)}
    </div>
  );
};

interface CellProps {
  dataKey: string;
  ariaLabel: string;
  onEnter: () => void;
}

/** Tekstvak dat pas bij verlaten of Enter vastlegt; Esc zet terug. */
const TextCell: React.FC<CellProps & { value: string; placeholder?: string; onCommit: (v: string) => void }> = ({ dataKey, ariaLabel, value, placeholder, onCommit, onEnter }) => {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);
  return (
    <input
      className="measurement-input"
      data-ml={dataKey}
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={draft ?? value}
      onFocus={() => { cancelled.current = false; setDraft(value); }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { if (draft !== null && !cancelled.current) onCommit(draft); setDraft(null); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); onEnter(); }
        else if (e.key === 'Escape') { cancelled.current = true; e.currentTarget.blur(); }
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
}> = ({ dataKey, ariaLabel, value, format, formula, onCommit, onEnter }) => {
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
      onBlur={finish}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); onEnter(); }
        else if (e.key === 'Escape') { cancelled.current = true; e.currentTarget.blur(); }
      }}
    />
  );
};
