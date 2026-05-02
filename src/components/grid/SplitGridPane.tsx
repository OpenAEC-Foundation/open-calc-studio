import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/state/appStore';
import { formatCurrency } from '@/utils/formatting';
import type { CostItem } from '@/types/costModel';

interface SplitGridPaneProps {
  documentId: string;
  onClose: () => void;
}

/** Compute visible items from a flat items array (skip collapsed subtrees) */
function getVisibleFromItems(items: CostItem[]): CostItem[] {
  const collapsedParents = new Set<string>();
  const visible: CostItem[] = [];

  for (const item of items) {
    let hidden = false;
    let pid = item.parentId;
    while (pid) {
      if (collapsedParents.has(pid)) {
        hidden = true;
        break;
      }
      const parent = items.find((i) => i.id === pid);
      pid = parent?.parentId ?? null;
    }
    if (!hidden && !item.rowType.startsWith('staart_')) {
      visible.push(item);
    }
    if (item.isCollapsed) {
      collapsedParents.add(item.id);
    }
  }
  return visible;
}

export const SplitGridPane: React.FC<SplitGridPaneProps> = ({ documentId, onClose }) => {
  const { t } = useTranslation();
  const documents = useAppStore((s) => s.documents);
  const activeDocumentId = useAppStore((s) => s.activeDocumentId);

  // Get items: if the split doc is the active doc, use live items from store;
  // otherwise use the snapshot stored in the document tab.
  const liveItems = useAppStore((s) => s.items);
  const doc = documents.find((d) => d.id === documentId);

  const items = useMemo(() => {
    if (!doc) return [];
    if (documentId === activeDocumentId) return liveItems;
    return doc.items;
  }, [doc, documentId, activeDocumentId, liveItems]);

  const visibleItems = useMemo(() => getVisibleFromItems(items), [items]);

  if (!doc) {
    return (
      <div className="split-pane-empty">
        <p>{t('splitDocNotFound') ?? 'Document niet gevonden'}</p>
        <button className="split-pane-close-btn" onClick={onClose}>{t('close') ?? 'Sluiten'}</button>
      </div>
    );
  }

  const total = visibleItems.reduce((sum, item) => {
    // Only sum root-level items to avoid double-counting
    if (!item.parentId) return sum + (item.total || 0);
    return sum;
  }, 0);

  return (
    <div className="split-pane">
      <div className="split-pane-header">
        <span className="split-pane-title">{doc.fileName}</span>
        <button className="split-pane-close-btn" onClick={onClose} title={t('close') ?? 'Sluiten'}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M12.78 4.28a.75.75 0 00-1.06-1.06L8 6.94 4.28 3.22a.75.75 0 00-1.06 1.06L6.94 8l-3.72 3.72a.75.75 0 101.06 1.06L8 9.06l3.72 3.72a.75.75 0 101.06-1.06L9.06 8l3.72-3.72z" />
          </svg>
        </button>
      </div>
      <div className="split-pane-body">
        <table className="split-pane-table">
          <thead>
            <tr>
              <th className="split-col-nr">Nr</th>
              <th className="split-col-desc">{t('description') ?? 'Omschrijving'}</th>
              <th className="split-col-qty">{t('quantity') ?? 'Hoev.'}</th>
              <th className="split-col-unit">{t('unit') ?? 'Eenh.'}</th>
              <th className="split-col-price">{t('unitPrice') ?? 'Ehprs'}</th>
              <th className="split-col-total">{t('total') ?? 'Totaal'}</th>
            </tr>
          </thead>
          <tbody>
            {visibleItems.map((item) => {
              const isChapter = item.rowType === 'chapter';
              const isBgr = item.rowType === 'begrotingspost' || item.rowType === 'bewakingspost';
              const isRegel = item.rowType === 'regel';
              const isTekst = item.rowType === 'tekstregel' || item.rowType === 'witregel';
              const rowClass = isChapter ? 'split-row-chapter' : isBgr ? 'split-row-bgr' : isTekst ? 'split-row-tekst' : '';

              return (
                <tr key={item.id} className={rowClass}>
                  <td className="split-col-nr">{item.nr || ''}</td>
                  <td className="split-col-desc" style={{ paddingLeft: (item.depth || 0) * 16 + 4 }}>
                    {item.description}
                  </td>
                  <td className="split-col-qty">
                    {isRegel && item.quantity != null ? item.quantity : ''}
                  </td>
                  <td className="split-col-unit">
                    {(isRegel || isBgr) ? (item.unit || '') : ''}
                  </td>
                  <td className="split-col-price">
                    {isRegel && item.unitPrice ? formatCurrency(item.unitPrice) : ''}
                  </td>
                  <td className="split-col-total">
                    {!isTekst && item.total ? formatCurrency(item.total) : ''}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="split-row-total">
              <td className="split-col-nr"></td>
              <td className="split-col-desc">{t('totalExclVat') ?? 'Totaal excl. BTW'}</td>
              <td className="split-col-qty"></td>
              <td className="split-col-unit"></td>
              <td className="split-col-price"></td>
              <td className="split-col-total">{formatCurrency(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};
