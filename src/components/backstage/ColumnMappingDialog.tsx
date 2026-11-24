import { useState, useEffect, useMemo } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import Modal from '../common/Modal';
import {
  TARGET_FIELDS,
  autoDetectMapping,
  summarizeCells,
  type ColumnMapping,
  type TabularData,
  type TargetField,
} from '../../services/importers';
import './ColumnMappingDialog.css';

export interface MappingOptions<F extends string> {
  fields?: { field: F; label: string }[];
  initialMapping?: F[];
  requiredFields?: F[];
  requiredHint?: string;
  introduction?: string;
}

interface Props<F extends string> extends MappingOptions<F> {
  open: boolean;
  data: TabularData | null;
  onClose: () => void;
  onConfirm: (mapping: F[]) => void;
}

const PREVIEW_ROWS = 6;

/**
 * Kolom-mapping-dialoog voor de generieke Excel/CSV-import. Toont een preview
 * van het bronbestand met per kolom een dropdown om het doelveld te kiezen; de
 * mapping wordt vooraf geraden (autoDetectMapping) en is door de gebruiker aan
 * te passen. Een niet-`ignore` doelveld kan aan hooguit één kolom hangen.
 */
export default function ColumnMappingDialog<F extends string = TargetField>({ open, data, onClose, onConfirm, fields, initialMapping, requiredFields, requiredHint, introduction }: Props<F>) {
  const { t } = useTranslation('dialogs');
  const [mapping, setMapping] = useState<F[]>([]);

  useEffect(() => {
    if (data) setMapping(initialMapping ?? autoDetectMapping(data.headers) as F[]);
  }, [data, initialMapping]);

  const setCol = (idx: number, field: F) => {
    setMapping((prev) => {
      const next = [...prev];
      if (field !== 'ignore') {
        for (let i = 0; i < next.length; i++) if (next[i] === field) next[i] = 'ignore' as F;
      }
      next[idx] = field;
      return next;
    });
  };

  const mappedCount = useMemo(() => mapping.filter((m) => m !== 'ignore').length, [mapping]);
  const hasRequiredFields = (requiredFields ?? ['description']).every(field => mapping.includes(field as F));
  // Vóór het importeren laten zien welke getallen opgeslagen Excel-uitkomsten
  // zijn en welke cellen geen bruikbare waarde hebben; dat volgt de koppeling (#88).
  const cellSummary = useMemo(
    () => (data ? summarizeCells(data, mapping as ColumnMapping) : { formulaValues: 0, unusableCells: 0 }),
    [data, mapping],
  );

  if (!data) return null;
  const previewRows = data.rows.slice(0, PREVIEW_ROWS);

  return (
    <Modal open={open} onClose={onClose} title={t('columnMapping.title')} className="column-mapping-dialog">
      <div className="cmd-body">
        <p className="cmd-intro">
          {introduction ?? <Trans
            t={t}
            i18nKey="columnMapping.intro"
            values={{ name: data.sourceName }}
            components={{ b: <strong /> }}
          />}
        </p>
        <div className="cmd-table-wrap">
          <table className="cmd-table">
            <thead>
              <tr>
                {data.headers.map((h, i) => (
                  <th key={i}>
                    <div className="cmd-header-name" title={h}>{h || t('columnMapping.columnN', { n: i + 1 })}</div>
                    <select
                      value={mapping[i] ?? 'ignore'}
                      onChange={(e) => setCol(i, e.target.value as F)}
                    >
                      {(fields ?? TARGET_FIELDS).map((f) => (
                        <option key={f.field} value={f.field}>{t(`columnMapping.fields.${f.field}`, { defaultValue: f.label })}</option>
                      ))}
                    </select>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row, ri) => (
                <tr key={ri}>
                  {data.headers.map((_, ci) => (
                    <td key={ci} className={mapping[ci] === 'ignore' ? 'cmd-ignored' : ''}>
                      {row[ci] ?? ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {(cellSummary.formulaValues > 0 || cellSummary.unusableCells > 0) && (
          <div className="cmd-notice" role="status">
            {cellSummary.formulaValues > 0 && (
              <p className="cmd-notice-formulas">{t('columnMapping.formulaValues', { count: cellSummary.formulaValues })}</p>
            )}
            {cellSummary.unusableCells > 0 && (
              <p className="cmd-notice-unusable">{t('columnMapping.unusableCells', { count: cellSummary.unusableCells })}</p>
            )}
          </div>
        )}
        <div className="cmd-footer">
          <span className="cmd-status">
            {t('columnMapping.columnsLinked', { count: mappedCount })} · {t('columnMapping.rows', { count: data.rows.length })}
            {!hasRequiredFields && <span className="cmd-warn"> · {requiredHint ?? t('columnMapping.linkDescriptionFirst')}</span>}
          </span>
          <div className="cmd-actions">
            <button className="cmd-btn" onClick={onClose}>{t('columnMapping.cancel')}</button>
            <button
              className="cmd-btn cmd-btn-primary"
              disabled={!hasRequiredFields}
              onClick={() => onConfirm(mapping)}
            >
              {t('columnMapping.import')}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
