/** Link one PDF measurement to an estimate row, from the PDF side (the grid route is "Link quantity"). */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from '@/components/common/Modal';
import '@/components/common/ExcelCellPicker.css'; // shared .modal-footer / .modal-btn styles
import { useAppStore } from '@/state/appStore';
import { uiText } from '@/i18n/uiText';
import { applyQuantityLink } from '@/services/quantity/quantitySourceActions';
import { pdfLinkUnit } from '@/services/quantity/quantityOrigin';
import { formatDecimals } from '@/utils/formatting';
import type { CostItem } from '@/types/costModel';
import type { SavedPdfMeasurement } from '@/types/pdfWorkspace';
import './PdfLinkPicker.css';

/** Same rows the MCP 'link' action accepts. */
export const PDF_LINKABLE_ROW_TYPES: readonly string[] = ['regel', 'begrotingspost', 'bewakingspost'];

/** Rows whose quantity is linked to this exact measurement (not to a PDF sum). */
export function rowsLinkedToMeasurement(items: CostItem[], measurementId: string) {
  return items.filter(item => item.quantityLink?.source === 'pdf' && item.quantityLink.measurementId === measurementId);
}

interface Props {
  measurement: SavedPdfMeasurement;
  onClose: () => void;
}

export function PdfLinkPicker({ measurement, onClose }: Props) {
  const { t } = useTranslation();
  const items = useAppStore(s => s.items);
  const activeItemId = useAppStore(s => s.activeItemId);
  const [query, setQuery] = useState('');
  const listId = useId();
  const optionId = (id: string) => `${listId}-${id}`;
  const unit = pdfLinkUnit(measurement.type);

  const rows = useMemo(() => {
    const byId = new Map(items.map(item => [item.id, item] as const));
    const chapterOf = (item: CostItem) => {
      let parent = item.parentId ? byId.get(item.parentId) : undefined;
      while (parent && parent.rowType !== 'chapter') parent = parent.parentId ? byId.get(parent.parentId) : undefined;
      return parent ? [parent.code, parent.description].filter(Boolean).join(' ') : '';
    };
    return items.filter(item => PDF_LINKABLE_ROW_TYPES.includes(item.rowType)).map(item => ({
      item,
      chapter: chapterOf(item),
      linked: item.quantityLink?.source === 'pdf' && item.quantityLink.measurementId === measurement.id,
    }));
  }, [items, measurement.id]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(({ item }) => (item.code ?? '').toLowerCase().includes(q) || (item.description ?? '').toLowerCase().includes(q) || (item.nr ?? '').toLowerCase().includes(q));
  }, [rows, query]);

  // Start on the row selected in the grid, else on a row already linked to this measurement.
  const [activeId, setActiveId] = useState<string | null>(() =>
    rows.find(r => r.item.id === activeItemId)?.item.id ?? rows.find(r => r.linked)?.item.id ?? rows[0]?.item.id ?? null);
  const active = visible.find(r => r.item.id === activeId) ?? visible[0];

  // Keep the highlighted row in view: on every change, and once when the list first appears
  // (the Modal renders its body one commit after this component mounts).
  const activeKey = useRef<string | undefined>(undefined);
  activeKey.current = active?.item.id;
  const scrollToActive = () => { if (activeKey.current) document.getElementById(optionId(activeKey.current))?.scrollIntoView?.({ block: 'nearest' }); };
  useEffect(scrollToActive, [active?.item.id]);
  const listMounted = useCallback((list: HTMLUListElement | null) => { if (list) scrollToActive(); }, []);

  function choose(item: CostItem) {
    applyQuantityLink(item.id, { source: 'pdf', measurementId: measurement.id, kind: measurement.type }, measurement.value, t('grid:undo.quantityLink'));
    onClose();
  }
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (active) choose(active.item);
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Home' && event.key !== 'End') return;
    if (!visible.length) return;
    event.preventDefault();
    const index = active ? visible.indexOf(active) : -1;
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? visible.length - 1
      : Math.min(visible.length - 1, Math.max(0, index + (event.key === 'ArrowDown' ? 1 : -1)));
    setActiveId(visible[next].item.id);
  }

  const value = formatDecimals(measurement.value, 3) || '0';
  return <Modal open onClose={onClose} title={uiText('pdf.linkTitle', 'Link to estimate row')} className="pdf-link-dialog">
    <div className="pdf-link-measurement">
      <span className="pdf-link-measurement-label" title={measurement.label}>{measurement.label}</span>
      <strong className="pdf-link-measurement-value">{value} {unit}</strong>
    </div>
    <p className="pdf-link-hint">{uiText('pdf.linkHint', 'The quantity and unit of the chosen row become {{value}} {{unit}} and follow this measurement from now on.', { value, unit })}</p>
    <div className="pdf-link-search">
      <input
        type="search" autoFocus value={query} onChange={e => setQuery(e.target.value)} onKeyDown={onKeyDown}
        role="combobox" aria-expanded="true" aria-controls={listId} aria-autocomplete="list"
        aria-activedescendant={active ? optionId(active.item.id) : undefined}
        aria-label={uiText('pdf.linkSearch', 'Search by code or description')} placeholder={uiText('pdf.linkSearch', 'Search by code or description')}
      />
    </div>
    <ul ref={listMounted} id={listId} role="listbox" className="pdf-link-list" aria-label={uiText('pdf.linkRows', 'Estimate rows')}>
      {visible.map(({ item, chapter, linked }) => <li
        key={item.id} id={optionId(item.id)} data-item-id={item.id} role="option" aria-selected={item.id === active?.item.id}
        className={`pdf-link-option${item.id === active?.item.id ? ' pdf-link-option--active' : ''}${item.rowType === 'regel' ? '' : ' pdf-link-option--post'}`}
        style={{ paddingInlineStart: 10 + Math.min(item.depth, 5) * 12 }}
        onMouseDown={e => e.preventDefault()} onMouseMove={() => { if (item.id !== activeId) setActiveId(item.id); }} onClick={() => choose(item)}
      >
        <span className="pdf-link-code">{item.code || item.nr}</span>
        <span className="pdf-link-text">
          <span className="pdf-link-desc" title={item.description}>{item.description || '—'}</span>
          {chapter && <span className="pdf-link-chapter" title={chapter}>{chapter}</span>}
        </span>
        {linked && <span className="pdf-link-badge">{uiText('pdf.linked', 'linked')}</span>}
        <span className="pdf-link-qty">{item.quantity == null ? '' : `${formatDecimals(item.quantity, 0, 3) || '0'} ${item.unit ?? ''}`.trim()}</span>
      </li>)}
    </ul>
    {!visible.length && <p className="pdf-link-empty" role="status">{rows.length ? uiText('pdf.linkNoMatch', 'No estimate rows match your search.') : uiText('pdf.linkNoRows', 'This estimate has no rows that can take a quantity yet.')}</p>}
    <div className="modal-footer">
      <button type="button" className="modal-btn modal-btn-secondary" onClick={onClose}>{uiText('cancel', 'Cancel')}</button>
      <button type="button" className="modal-btn modal-btn-primary" disabled={!active} onClick={() => { if (active) choose(active.item); }}>{uiText('pdf.linkConfirm', 'Link')}</button>
    </div>
  </Modal>;
}

const rowName = (item: CostItem) => [item.code || item.nr, item.description].filter(Boolean).join(' ');

/** "→ 21.10 Masonry, 21.20 Plaster +1" under a measurement in the PDF list. */
export function PdfMeasurementLinks({ measurementId }: { measurementId: string }) {
  const items = useAppStore(s => s.items);
  const linked = useMemo(() => rowsLinkedToMeasurement(items, measurementId), [items, measurementId]);
  if (!linked.length) return null;
  const names = linked.map(rowName);
  return <span className="pdf-ws-row-links" title={names.join('\n')}>
    <span className="pdf-ws-sr-only">{uiText('pdf.linkedTo', 'Linked to')}: </span>
    <span aria-hidden="true">→ </span>{names.slice(0, 2).join(', ')}
    {linked.length > 2 && <span className="pdf-ws-row-links-more"> {uiText('pdf.linkedMore', '+{{count}}', { count: linked.length - 2 })}</span>}
  </span>;
}
