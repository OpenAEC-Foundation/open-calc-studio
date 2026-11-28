import { uiText } from '@/i18n/uiText';
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/state/appStore';
import type { ResourceLibraryItem, ResourceType } from '@/types/costModel';
import { formatCurrency } from '@/utils/formatting';
import { formatUnit } from '@/i18n/formatUnit';
import { capturePriceOrigin } from '@/services/pricing/priceUpdates';
import { activeLibrariesOf, COUNTRY_LIBRARY, ENGLISH_LIBRARY, hasPriceLibrary, isBuiltInLibraryItem, libraryOfCountry, priceCountryOf } from '@/services/pricing/priceLibraries';
import { libraryChoiceName, PriceLibraryPanel, useOwnLibraries, type PanelMessage } from './PriceLibraryPanel';
import { Banner } from './Banner';
import { resourceTarget } from '@/services/pricing/resourceTarget';
import { useDialogFocus } from '@/hooks/useDialogFocus';
import '../panels/panels.css';

const RESOURCE_TYPE_COLORS: Record<ResourceType, string> = {
  arbeid: '#3b82f6',
  materieel: '#f59e0b',
  materiaal: '#10b981',
  onderaannemer: '#8b5cf6',
  overig: '#6b7280',
};

export const ResourcePicker: React.FC = () => {
  const { t, i18n } = useTranslation();
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
  const [error, setError] = useState('');
  const [message, setMessage] = useState<PanelMessage>(null);
  /** Country whose library note was closed; it comes back for another country or when the dialog opens again. */
  const [closedNote, setClosedNote] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  // Price libraries of the active estimate (issues #93, #104).
  const country = useAppStore(s => priceCountryOf(s.schedule));
  const countryOn = useAppStore(s => activeLibrariesOf(s.schedule).includes(COUNTRY_LIBRARY));
  const ownLibraries = useOwnLibraries();
  /** Library name of an article, shown on each row when the list mixes libraries. */
  const libraryOf = useMemo(() => {
    const names = new Map(ownLibraries.map(l => [l.id, l.name]));
    const countryLabel = libraryChoiceName(libraryOfCountry(country), i18n.language);
    return (item: ResourceLibraryItem): string | undefined =>
      item.catalogueId === undefined ? undefined : isBuiltInLibraryItem(item) ? countryLabel : names.get(item.catalogueId);
  }, [ownLibraries, country, i18n.language]);
  const showLibrary = useMemo(
    () => resourcePickerOpen && new Set(resourceLibrary.map(i => libraryOf(i) ?? '')).size > 1,
    [resourcePickerOpen, resourceLibrary, libraryOf],
  );
  const resetList = useCallback(() => { setSelectedCategory(null); setSelectedIndex(0); }, []);
  const listRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  // Tab stays in the dialog, Escape closes it, focus returns to where it came from.
  useDialogFocus(dialogRef, resourcePickerOpen, closeResourcePicker);

  // Focus search input on open; a notice from where it was opened (an
  // imported price library) shows as the panel message.
  useEffect(() => {
    if (resourcePickerOpen) {
      const notice = useAppStore.getState().resourcePickerNotice;
      setMessage(notice ? { text: notice, kind: 'info' } : null);
      setError('');
      setClosedNote(null);
      setSearch('');
      setSelectedCategory(null);
      setSelectedIndex(0);
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [resourcePickerOpen]);

  // Unique categories with their counts
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of resourceLibrary) counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
    return Array.from(counts).sort(([a], [b]) => a.localeCompare(b));
  }, [resourceLibrary]);

  // Filter items
  const filtered = useMemo(() => {
    let list = resourceLibrary;
    if (selectedCategory !== null) {
      list = list.filter(i => i.category === selectedCategory);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase(); // spaties eromheen tellen niet (knownbug 195)
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

  // Where a resource goes: the post of the selected row, else the last post.
  const target = useMemo(() => resourceTarget(items, resourcePickerParentId), [items, resourcePickerParentId]);

  const handleSelect = useCallback((item: ResourceLibraryItem) => {
    if (item.unitSupported === false) return;
    let priceOrigin;
    try { priceOrigin = item.defaultUnitPrice === null ? undefined : capturePriceOrigin(item, useAppStore.getState().schedule.currency); }
    catch (e) { setError(String(e)); return; }

    pushHistory(items, t('dialogs:undo.addResource'));
    // No post yet: make one in the selected chapter, or a chapter with a post.
    const store0 = useAppStore.getState();
    const postId = target.post?.id ?? store0.addItem(target.chapterId ?? store0.addChapter(null));
    const newId = addRegel(postId);
    if (newId) {
      // Update the new regel with the library item's data
      const store = useAppStore.getState();
      store.updateItem(newId, 'code', item.code);
      store.updateItem(newId, 'description', item.description);
      store.updateItem(newId, 'unit', item.unit);
      store.updateItem(newId, 'resourceType', item.resourceType);
      store.updateItem(newId, 'resourceLibraryId', item.id);
      // Unit 'uur' makes updateItem pick tariff A with norm 1 on an empty row,
      // which fills laborPrice with the hourly rate. A library article costs
      // exactly its library price: no tariff and no hidden labour on top of
      // it, also when the library has no price (knownbug 190).
      store.updateItem(newId, 'tariefGroep', null);
      store.updateItem(newId, 'laborPrice', null);
      if (item.defaultUnitPrice === null) {
        store.updateItem(newId, 'normUnitPrice', null);
        store.updateItem(newId, 'notes', uiText("pricing.missing", "Price missing: enter a verified price and source."));
      }
      if (item.defaultUnitPrice !== null) {
        store.updateItem(newId, 'normUnitPrice', item.defaultUnitPrice);
        store.updateItem(newId, 'normQuantity', 1);
        store.updateItem(newId, 'normFactor', 1);
        store.updateItem(newId, 'normDivisor', 1);
      }
      useAppStore.setState(s => ({ items: s.items.map(row => row.id === newId ? { ...row, priceOrigin } : row) }));
    }
    closeResourcePicker();
  }, [target, pushHistory, items, addRegel, closeResourcePicker, t]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Arrows, Enter and Space in the library controls belong to those controls.
    const tag = (e.target as HTMLElement).tagName;
    if ((tag === 'SELECT' || tag === 'BUTTON' || (tag === 'INPUT' && (e.target as HTMLInputElement).type !== 'text')) && e.key !== 'Escape') return;
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

  const selected = filtered[selectedIndex];
  const countryLabel = libraryChoiceName(country, i18n.language);
  const englishNote = uiText('pricing.englishNote', 'You see the English library: common resources with English names and no prices. Enter your own prices or import a price list.');
  const showCountryNote = countryOn && closedNote !== country;
  const dismissCountryNote = () => setClosedNote(country);

  return (
    <div className="resource-picker-overlay" onClick={closeResourcePicker}>
      <div ref={dialogRef} tabIndex={-1} className="resource-picker" role="dialog" aria-modal="true" aria-labelledby="resource-picker-title" onClick={e => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className="resource-picker-header">
          <h2 id="resource-picker-title">{t('chooseResource')}</h2>
          <div className="resource-picker-header-actions">
            <button type="button" className="rp-ghost-btn" onClick={() => { closeResourcePicker(); useAppStore.getState().openDialog('priceUpdates'); }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v2.8h-2.8" /></svg>
              {uiText('pricing.updates', 'Review price updates')}
            </button>
            <button type="button" className="resource-picker-close" aria-label={t('close', { defaultValue: 'Close' })} onClick={closeResourcePicker}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M12.78 4.28a.75.75 0 00-1.06-1.06L8 6.94 4.28 3.22a.75.75 0 00-1.06 1.06L6.94 8l-3.72 3.72a.75.75 0 101.06 1.06L8 9.06l3.72 3.72a.75.75 0 101.06-1.06L9.06 8l3.72-3.72z" />
              </svg>
            </button>
          </div>
        </div>

        <div className="resource-picker-body">
          <aside className="resource-picker-side">
            <PriceLibraryPanel onChange={resetList} onMessage={setMessage} />
            <div className="resource-picker-categories">
              <button
                type="button"
                className={`resource-picker-cat${selectedCategory === null ? ' active' : ''}`}
                onClick={resetList}
              >
                <span>{t('allResources', { count: resourceLibrary.length })}</span>
              </button>
              {categories.map(([cat, count]) => (
                <button
                  type="button"
                  key={cat}
                  className={`resource-picker-cat${selectedCategory === cat ? ' active' : ''}`}
                  onClick={() => { setSelectedCategory(cat); setSelectedIndex(0); }}
                  title={cat}
                >
                  <span>{cat || '—'}</span><span className="rp-cat-count">{count}</span>
                </button>
              ))}
            </div>
          </aside>

          <div className="resource-picker-main">
            <div className="resource-picker-search">
              <svg className="rp-search-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5L14 14" /></svg>
              <input
                ref={searchRef}
                type="text"
                role="combobox"
                aria-label={t('searchResource')}
                aria-controls="resource-picker-listbox"
                aria-expanded="true"
                aria-autocomplete="list"
                aria-activedescendant={filtered[selectedIndex] ? `resource-picker-option-${selectedIndex}` : undefined}
                placeholder={t('searchResource')}
                value={search}
                onChange={e => { setSearch(e.target.value); setSelectedIndex(0); }}
              />
            </div>
            {(error || message || showCountryNote) && (
              <div className="rp-banners">
                {error && <Banner kind="error" role="alert" onClose={() => setError('')}>{error}</Banner>}
                {message && <Banner kind={message.kind} role={message.kind === 'error' ? 'alert' : 'status'} onClose={() => setMessage(null)}>{message.text}</Banner>}
                {showCountryNote && (country === ENGLISH_LIBRARY
                  ? <Banner kind="note" onClose={dismissCountryNote}>{englishNote}</Banner>
                  : hasPriceLibrary(country)
                  ? <Banner kind="note" onClose={dismissCountryNote}>{uiText('pricing.notice', 'Starter library: {{country}}. Check prices and reference dates before estimating. A missing price is not treated as verified.', { country: countryLabel })}</Banner>
                  : <Banner kind="warn" role="status" className="resource-picker-no-library" onClose={dismissCountryNote}>{uiText('pricing.noLibrary', 'There is no price library for this country yet ({{country}}). Resources you imported or added stay available.', { country: countryLabel })}{' '}{englishNote}</Banner>)}
              </div>
            )}

            <div className="resource-picker-list" ref={listRef} id="resource-picker-listbox" role="listbox" aria-label={t('chooseResource')}>
              <div className="resource-picker-list-header" aria-hidden="true">
                <span className="rp-col-code">{t('code')}</span>
                <span className="rp-col-desc">{t('description')}</span>
                <span className="rp-col-type">{t('type')}</span>
                <span className="rp-col-unit">{t('unit')}</span>
                <span className="rp-col-price">{t('price')}</span>
              </div>
              {filtered.length === 0 && (
                <div className="resource-picker-empty">{t('noResourcesFound')}</div>
              )}
              {filtered.map((item, idx) => {
                const library = showLibrary ? libraryOf(item) : undefined;
                return (
                  <div
                    key={item.id}
                    id={`resource-picker-option-${idx}`}
                    role="option"
                    aria-selected={idx === selectedIndex}
                    aria-disabled={item.unitSupported === false || undefined}
                    data-index={idx}
                    className={`resource-picker-row${idx === selectedIndex ? ' selected' : ''}${item.unitSupported === false ? ' blocked' : ''}`}
                    onClick={() => setSelectedIndex(idx)}
                    onDoubleClick={() => handleSelect(item)}
                  >
                    <span className="rp-col-code" title={item.code}>{item.code}</span>
                    <span className="rp-col-desc" title={library ? `${item.description} · ${library}` : item.description}>
                      <span className="rp-desc-text">{item.description}</span>
                      {library && <span className="rp-lib-badge">{library}</span>}
                    </span>
                    <span className="rp-col-type">
                      <span
                        className="rp-type-badge"
                        title={t(`dialogs:resourceTypes.${item.resourceType}`)}
                        style={{ backgroundColor: RESOURCE_TYPE_COLORS[item.resourceType] + '22', color: RESOURCE_TYPE_COLORS[item.resourceType], borderColor: RESOURCE_TYPE_COLORS[item.resourceType] + '44' }}
                      >
                        {t(`dialogs:resourceTypes.${item.resourceType}`)}
                      </span>
                    </span>
                    <span className="rp-col-unit">{item.unitSupported === false ? item.originalUnit : formatUnit(item.unit, t)}</span>
                    <span className={`rp-col-price${item.defaultUnitPrice === null ? ' empty' : ''}`} title={item.defaultUnitPrice !== null ? undefined : uiText("pricing.enter", "Enter price")}>
                      {item.defaultUnitPrice !== null ? formatCurrency(item.defaultUnitPrice) : uiText("pricing.enter", "Enter price")}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="resource-picker-footer">
          <div className="rp-footer-info">
            {selected?.source && <div>{uiText("pricing.source", "Source:")} {selected.source}</div>}
            {selected?.unitSupported === false && <div>{uiText("pricing.conversion", "This source unit requires manual conversion; adding it is disabled.")}</div>}
            <div className="rp-add-target">{target.post
              ? uiText('pricing.addTo', 'Adds to: {{name}}', { name: [target.post.code, target.post.description].filter(Boolean).join(' ') || '—' })
              : uiText('pricing.addToNew', 'Adds to a new estimate item')}</div>
          </div>
          <span className="resource-picker-hint">
            {t('resourceHint', { count: filtered.length })}
          </span>
          <button
            type="button"
            className="resource-picker-add-btn"
            disabled={filtered.length === 0 || selected?.unitSupported === false}
            onClick={() => selected && handleSelect(selected)}
          >
            {t('add')}
          </button>
        </div>
      </div>
    </div>
  );
};
