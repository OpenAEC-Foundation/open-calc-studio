import { useState, useEffect, useMemo } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import Modal from '../common/Modal';
import {
  TARGET_FIELDS,
  autoDetectMapping,
  type ColumnMapping,
  type TabularData,
  type TargetField,
} from '../../services/importers';
import './ColumnMappingDialog.css';

interface Props {
  open: boolean;
  data: TabularData | null;
  onClose: () => void;
  onConfirm: (mapping: ColumnMapping) => void;
}

const PREVIEW_ROWS = 6;

/**
 * Kolom-mapping-dialoog voor de generieke Excel/CSV-import. Toont een preview
 * van het bronbestand met per kolom een dropdown om het doelveld te kiezen; de
 * mapping wordt vooraf geraden (autoDetectMapping) en is door de gebruiker aan
 * te passen. Een niet-`ignore` doelveld kan aan hooguit één kolom hangen.
 */
export default function ColumnMappingDialog({ open, data, onClose, onConfirm }: Props) {
  const { t } = useTranslation('dialogs');
  const [mapping, setMapping] = useState<ColumnMapping>([]);

  useEffect(() => {
    if (data) setMapping(autoDetectMapping(data.headers));
  }, [data]);

  const setCol = (idx: number, field: TargetField) => {
    setMapping((prev) => {
      const next = [...prev];
      if (field !== 'ignore') {
        for (let i = 0; i < next.length; i++) if (next[i] === field) next[i] = 'ignore';
      }
      next[idx] = field;
      return next;
    });
  };

  const mappedCount = useMemo(() => mapping.filter((m) => m !== 'ignore').length, [mapping]);
  const hasDescription = mapping.includes('description');

  if (!data) return null;
  const previewRows = data.rows.slice(0, PREVIEW_ROWS);

  return (
    <Modal open={open} onClose={onClose} title={t('columnMapping.title')} className="column-mapping-dialog">
      <div className="cmd-body">
        <p className="cmd-intro">
          <Trans
            t={t}
            i18nKey="columnMapping.intro"
            values={{ name: data.sourceName }}
            components={{ b: <strong /> }}
          />
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
                      onChange={(e) => setCol(i, e.target.value as TargetField)}
                    >
                      {TARGET_FIELDS.map((t) => (
                        <option key={t.field} value={t.field}>{t.label}</option>
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
        <div className="cmd-footer">
          <span className="cmd-status">
            {t('columnMapping.columnsLinked', { count: mappedCount })} · {t('columnMapping.rows', { count: data.rows.length })}
            {!hasDescription && <span className="cmd-warn"> · {t('columnMapping.linkDescriptionFirst')}</span>}
          </span>
          <div className="cmd-actions">
            <button className="cmd-btn" onClick={onClose}>{t('columnMapping.cancel')}</button>
            <button
              className="cmd-btn cmd-btn-primary"
              disabled={!hasDescription}
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
