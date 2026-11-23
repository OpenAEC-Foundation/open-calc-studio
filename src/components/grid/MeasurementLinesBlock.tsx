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

const FIELD_WIDTH = 72;
const SUBTOTAL_WIDTH = 92;
const ACTION_WIDTH = 22;

const fmt = (v: number | null | undefined): string => (v == null ? '' : formatDecimals(v, 2, 3) || '0');

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

  const columnsTemplate = `minmax(140px, 1fr) repeat(4, ${FIELD_WIDTH}px) ${SUBTOTAL_WIDTH}px ${ACTION_WIDTH}px`;
  const sum = measurementSum(lines);
  const collapsed = !!item.measurementLinesCollapsed;

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

  return (
    <div
      className={`measurement-block${collapsed ? ' measurement-collapsed' : ''}`}
      style={{ marginLeft: left, width, height: measurementBlockHeight(item) }}
      onKeyDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
      data-measurement-for={item.id}
    >
      {collapsed ? (
        <div className="measurement-row measurement-summary" style={{ gridTemplateColumns: columnsTemplate }}>
          <span className="measurement-title">{toggle}{t('grid:measurement.linesCount', { count: lines.length })}</span>
          <span /><span /><span />
          <span className="num">{t('grid:measurement.sum')}</span>
          <span className="num measurement-value measurement-sum">{fmt(sum)}</span>
          <span />
        </div>
      ) : (<>
      <div className="measurement-row measurement-head" style={{ gridTemplateColumns: columnsTemplate }}>
        <span className="measurement-title">{toggle}{t('grid:measurement.description')}</span>
        <span className="num">{t('grid:measurement.count')}</span>
        <span className="num">{t('grid:measurement.length')}</span>
        <span className="num">{t('grid:measurement.width')}</span>
        <span className="num">{t('grid:measurement.height')}</span>
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
          <span className="num measurement-value">{fmt(line.subtotal ? subtotalValue(lines, index) : lineValue(line))}</span>
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
        <span /><span /><span />
        <span className="num">{t('grid:measurement.sum')}</span>
        <span className="num measurement-value measurement-sum">{fmt(sum)}</span>
        <span />
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
  formula?: string;
  onCommit: (value: number | null, formula: string | undefined) => void;
}> = ({ dataKey, ariaLabel, value, formula, onCommit, onEnter }) => {
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
      value={draft ?? (value == null ? '' : fmt(value))}
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
