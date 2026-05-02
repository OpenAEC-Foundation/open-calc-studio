import { useState, useMemo } from 'react';
import { findMatchingCostItems } from '@/services/offerte/costItemMatcher';
import { useAppStore } from '@/state/appStore';
import { formatCurrency } from '@/utils/formatting';
import './Modal.css';
import './CostItemPicker.css';

interface CostItemPickerProps {
  open: boolean;
  offerteOnderdeel: string;
  offerteOmschrijving: string;
  linkedChapterId: string | null;
  currentLinkedId: string | null;
  onSelect: (costItemId: string) => void;
  onUnlink: () => void;
  onCancel: () => void;
}

export default function CostItemPicker({
  open, offerteOnderdeel, offerteOmschrijving, linkedChapterId,
  currentLinkedId, onSelect, onUnlink, onCancel,
}: CostItemPickerProps) {
  const items = useAppStore(s => s.items);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(currentLinkedId);

  const suggestions = useMemo(() =>
    findMatchingCostItems(offerteOnderdeel, offerteOmschrijving, items, linkedChapterId),
    [offerteOnderdeel, offerteOmschrijving, items, linkedChapterId]
  );

  const filteredItems = useMemo(() => {
    if (!search.trim()) return items.filter(i => !i.rowType.startsWith('staart_'));
    const q = search.toLowerCase();
    return items.filter(i =>
      !i.rowType.startsWith('staart_') &&
      (i.description.toLowerCase().includes(q) || i.code.toLowerCase().includes(q))
    );
  }, [items, search]);

  if (!open) return null;

  return (
    <div className="modal-overlay modal-open">
      <div className="modal-dialog modal-dialog-open cost-picker-dialog">
        <div className="modal-header">
          <span className="modal-title">Koppel aan begrotingsregel</span>
          <button className="modal-close" onClick={onCancel}>&times;</button>
        </div>

        <div className="cost-picker-search">
          <input
            type="text"
            placeholder="Zoek op omschrijving of code..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
        </div>

        <div className="cost-picker-body">
          {suggestions.length > 0 && !search && (
            <div className="cost-picker-suggestions">
              <div className="cost-picker-section-label">Suggesties</div>
              {suggestions.map(s => (
                <button
                  key={s.costItemId}
                  className={`cost-picker-item${selectedId === s.costItemId ? ' selected' : ''}`}
                  onClick={() => setSelectedId(s.costItemId)}
                >
                  <span className="cost-picker-badge">{Math.round(s.score * 100)}%</span>
                  <span className="cost-picker-code">{s.code}</span>
                  <span className="cost-picker-desc">{s.description}</span>
                </button>
              ))}
            </div>
          )}

          <div className="cost-picker-section-label">
            {search ? `Resultaten (${filteredItems.length})` : 'Alle regels'}
          </div>
          <div className="cost-picker-list">
            {filteredItems.map(item => (
              <button
                key={item.id}
                className={`cost-picker-item${selectedId === item.id ? ' selected' : ''} depth-${Math.min(item.depth, 4)}`}
                onClick={() => setSelectedId(item.id)}
              >
                <span className="cost-picker-code">{item.code || item.nr}</span>
                <span className="cost-picker-desc">{item.description}</span>
                <span className="cost-picker-price">{item.total ? formatCurrency(item.total) : ''}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="modal-footer">
          {currentLinkedId && (
            <button className="modal-btn modal-btn-danger" onClick={onUnlink}>Ontkoppelen</button>
          )}
          <div style={{ flex: 1 }} />
          <button className="modal-btn modal-btn-secondary" onClick={onCancel}>Annuleren</button>
          <button className="modal-btn modal-btn-primary" onClick={() => { if (selectedId) onSelect(selectedId); }} disabled={!selectedId}>Koppelen</button>
        </div>
      </div>
    </div>
  );
}
