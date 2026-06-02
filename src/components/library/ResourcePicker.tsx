import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/state/appStore';
import type { ResourceLibraryItem, ResourceType } from '@/types/costModel';
import { formatCurrency } from '@/utils/formatting';
import '../panels/panels.css';

const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
  arbeid: 'Arbeid',
  materieel: 'Materieel',
  materiaal: 'Materiaal',
  onderaannemer: 'Onderaannemer',
  overig: 'Overig',
};

const RESOURCE_TYPE_COLORS: Record<ResourceType, string> = {
  arbeid: '#3b82f6',
  materieel: '#f59e0b',
  materiaal: '#10b981',
  onderaannemer: '#8b5cf6',
  overig: '#6b7280',
};

export const ResourcePicker: React.FC = () => {
  const { t } = useTranslation();
  const {
    resourceLibrary,
    resourcePickerOpen,
    resourcePickerParentId,
    closeResourcePicker,
    addRegel,
    items,
    pushHistory,
  } = useAppStore();

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Focus search input on open
  useEffect(() => {
    if (resourcePickerOpen) {
      setSearch('');
      setSelectedCategory(null);
      setSelectedIndex(0);
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [resourcePickerOpen]);

  // Get unique categories
  const categories = useMemo(() => {
    const cats = new Set<string>();
    for (const item of resourceLibrary) cats.add(item.category);
    return Array.from(cats).sort();
  }, [resourceLibrary]);

  // Filter items
  const filtered = useMemo(() => {
    let list = resourceLibrary;
    if (selectedCategory) {
      list = list.filter(i => i.category === selectedCategory);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(i =>
        i.description.toLowerCase().includes(q) ||
        i.code.toLowerCase().includes(q) ||
        i.category.toLowerCase().includes(q)
      );
    }
    return list;
  }, [resourceLibrary, selectedCategory, search]);

  // Clamp selected index
  useEffect(() => {
    if (selectedIndex >= filtered.length) {
      setSelectedIndex(Math.max(0, filtered.length - 1));
    }
  }, [filtered.length, selectedIndex]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const row = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      row?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  const handleSelect = useCallback((item: ResourceLibraryItem) => {
    if (!resourcePickerParentId) return;

    pushHistory(items, 'Middel toevoegen');
    const newId = addRegel(resourcePickerParentId);
    if (newId) {
      // Update the new regel with the library item's data
      const store = useAppStore.getState();
      store.updateItem(newId, 'code', item.code);
      store.updateItem(newId, 'description', item.description);
      store.updateItem(newId, 'unit', item.unit);
      store.updateItem(newId, 'resourceType', item.resourceType);
      store.updateItem(newId, 'resourceLibraryId', item.id);
      if (item.defaultUnitPrice !== null) {
        store.updateItem(newId, 'normUnitPrice', item.defaultUnitPrice);
        store.updateItem(newId, 'normQuantity', 1);
        store.updateItem(newId, 'normFactor', 1);
        store.updateItem(newId, 'normDivisor', 1);
      }
    }
    closeResourcePicker();
  }, [resourcePickerParentId, pushHistory, items, addRegel, closeResourcePicker]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        handleSelect(filtered[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      closeResourcePicker();
    }
  }, [filtered, selectedIndex, handleSelect, closeResourcePicker]);

  if (!resourcePickerOpen) return null;

  return (
    <div className="resource-picker-overlay" onClick={closeResourcePicker}>
      <div className="resource-picker" onClick={e => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className="resource-picker-header">
          <h2>{t('chooseResource')}</h2>
          <button className="resource-picker-close" onClick={closeResourcePicker}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M12.78 4.28a.75.75 0 00-1.06-1.06L8 6.94 4.28 3.22a.75.75 0 00-1.06 1.06L6.94 8l-3.72 3.72a.75.75 0 101.06 1.06L8 9.06l3.72 3.72a.75.75 0 101.06-1.06L9.06 8l3.72-3.72z" />
            </svg>
          </button>
        </div>

        <div className="resource-picker-search">
          <input
            ref={searchRef}
            type="text"
            placeholder={t('searchResource')}
            value={search}
            onChange={e => { setSearch(e.target.value); setSelectedIndex(0); }}
          />
        </div>

        <div className="resource-picker-body">
          <div className="resource-picker-categories">
            <button
              className={`resource-picker-cat${selectedCategory === null ? ' active' : ''}`}
              onClick={() => { setSelectedCategory(null); setSelectedIndex(0); }}
            >
              {t('allResources', { count: resourceLibrary.length })}
            </button>
            {categories.map(cat => {
              const count = resourceLibrary.filter(i => i.category === cat).length;
              return (
                <button
                  key={cat}
                  className={`resource-picker-cat${selectedCategory === cat ? ' active' : ''}`}
                  onClick={() => { setSelectedCategory(cat); setSelectedIndex(0); }}
                >
                  {cat} ({count})
                </button>
              );
            })}
          </div>

          <div className="resource-picker-list" ref={listRef}>
            <div className="resource-picker-list-header">
              <span className="rp-col-code">{t('code')}</span>
              <span className="rp-col-desc">{t('description')}</span>
              <span className="rp-col-type">{t('type')}</span>
              <span className="rp-col-unit">{t('unit')}</span>
              <span className="rp-col-price">{t('price')}</span>
            </div>
            {filtered.length === 0 && (
              <div className="resource-picker-empty">{t('noResourcesFound')}</div>
            )}
            {filtered.map((item, idx) => (
              <div
                key={item.id}
                data-index={idx}
                className={`resource-picker-row${idx === selectedIndex ? ' selected' : ''}`}
                onClick={() => setSelectedIndex(idx)}
                onDoubleClick={() => handleSelect(item)}
              >
                <span className="rp-col-code">{item.code}</span>
                <span className="rp-col-desc">{item.description}</span>
                <span className="rp-col-type">
                  <span
                    className="rp-type-badge"
                    style={{ backgroundColor: RESOURCE_TYPE_COLORS[item.resourceType] + '22', color: RESOURCE_TYPE_COLORS[item.resourceType], borderColor: RESOURCE_TYPE_COLORS[item.resourceType] + '44' }}
                  >
                    {RESOURCE_TYPE_LABELS[item.resourceType]}
                  </span>
                </span>
                <span className="rp-col-unit">{item.unit}</span>
                <span className="rp-col-price">
                  {item.defaultUnitPrice !== null ? formatCurrency(item.defaultUnitPrice) : '-'}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="resource-picker-footer">
          <span className="resource-picker-hint">
            {t('resourceHint', { count: filtered.length })}
          </span>
          <button
            className="resource-picker-add-btn"
            disabled={filtered.length === 0}
            onClick={() => filtered[selectedIndex] && handleSelect(filtered[selectedIndex])}
          >
            {t('add')}
          </button>
        </div>
      </div>
    </div>
  );
};
