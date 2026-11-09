import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TREE_NUMBERS, type TreeView } from './treeModel';

/** Onder deze breedte van de boom verbergt de CSS het % (@container in panels.css). */
const PCT_MIN_WIDTH = 260;
/** Vaste id van de hint "zichtbaar bij een breder paneel" (aria-describedby). */
const PCT_HINT_ID = 'schedule-tree-percent-hint';

/**
 * Structuurboom, het knopje "Weergave" in de kop met zijn uitklapvenster:
 * wat er vóór de omschrijving staat (Nr / Code / niets) en of bedragen en
 * "% van totaal" zichtbaar zijn. De keuze zelf bewaart het paneel.
 */
export const TreeViewOptions: React.FC<{ view: TreeView; setView: (patch: Partial<TreeView>) => void }> = ({ view, setView }) => {
  const { t } = useTranslation();
  const [showViewMenu, setShowViewMenu] = useState(false);
  const viewMenuRef = useRef<HTMLDivElement>(null);
  const viewButtonRef = useRef<HTMLButtonElement>(null);
  const viewPanelRef = useRef<HTMLDivElement>(null);
  /** Is de boom nu te smal voor het % (zie PCT_MIN_WIDTH)? Gemeten bij openen. */
  const [narrow, setNarrow] = useState(false);
  // Het venster opent naar het paneel toe (CSS: inset-inline-end: 0). Bij een
  // heel smal paneel steekt het dan aan de beginkant buiten beeld: schuif het
  // terug, binnen het paneel als het past, anders binnen het venster. Gemeten
  // in schermpixels, dus het werkt voor links-naar-rechts en rechts-naar-links.
  useLayoutEffect(() => {
    const menu = viewPanelRef.current;
    if (!showViewMenu || !menu) return;
    const r = menu.getBoundingClientRect();
    if (r.width === 0) return; // geen layout (bv. jsdom)
    const margin = 4;
    let min = margin;
    let max = window.innerWidth - margin;
    const panel = viewMenuRef.current?.closest('.schedule-tree-wrap')?.getBoundingClientRect();
    if (panel && panel.width >= r.width) {
      min = Math.max(min, panel.left);
      max = Math.min(max, panel.right);
    }
    const dx = r.left < min ? min - r.left : r.right > max ? Math.max(max - r.right, min - r.left) : 0;
    if (dx) menu.style.transform = `translateX(${Math.round(dx)}px)`;
  }, [showViewMenu]);
  useEffect(() => {
    if (!showViewMenu) return;
    const tree = viewMenuRef.current?.closest('.schedule-tree-wrap')?.querySelector<HTMLElement>('.schedule-tree');
    setNarrow(!!tree && tree.clientWidth > 0 && tree.clientWidth <= PCT_MIN_WIDTH);
    // Bij openen de focus op de eerste optie, zodat het menu met het toetsenbord werkt.
    viewPanelRef.current?.querySelector<HTMLInputElement>('input:checked, input')?.focus();
    const onMouseDown = (e: MouseEvent) => {
      if (viewMenuRef.current && !viewMenuRef.current.contains(e.target as Node)) setShowViewMenu(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation(); // alleen dit menu dicht, niet ook nog iets anders
      setShowViewMenu(false);
      viewButtonRef.current?.focus(); // terug naar het knopje
    };
    document.addEventListener('pointerdown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [showViewMenu]);

  return (
    <div
      className="schedule-tree-view"
      ref={viewMenuRef}
      // Focus verlaat het menu (Tab weg): dicht.
      onBlur={(e) => {
        if (showViewMenu && !viewMenuRef.current?.contains(e.relatedTarget as Node | null)) setShowViewMenu(false);
      }}
    >
      <button
        ref={viewButtonRef}
        type="button"
        className="schedule-tree-view-btn"
        aria-label={t('structureTree.view')}
        title={t('structureTree.view')}
        aria-haspopup="dialog"
        aria-expanded={showViewMenu}
        onClick={() => setShowViewMenu((v) => !v)}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <line x1="2" y1="4" x2="14" y2="4" /><line x1="2" y1="8" x2="14" y2="8" /><line x1="2" y1="12" x2="14" y2="12" />
          <circle cx="10" cy="4" r="1.6" fill="var(--theme-surface)" />
          <circle cx="5" cy="8" r="1.6" fill="var(--theme-surface)" />
          <circle cx="11" cy="12" r="1.6" fill="var(--theme-surface)" />
        </svg>
      </button>
      {showViewMenu && (
        <div ref={viewPanelRef} className="schedule-tree-view-menu" role="dialog" aria-label={t('structureTree.view')}>
          <div className="schedule-tree-view-heading" id="schedule-tree-number-heading">{t('structureTree.numberHeading')}</div>
          {/* Eén keuze uit drie: Nr (de plek, verandert mee bij verplaatsen),
              Code (eigen code, verandert nooit) of niets. */}
          <div className="schedule-tree-view-segmented" role="radiogroup" aria-labelledby="schedule-tree-number-heading">
            {TREE_NUMBERS.map((n) => (
              <label key={n} className={`schedule-tree-view-segment${view.number === n ? ' is-on' : ''}`}>
                <input type="radio" name="schedule-tree-number" value={n} checked={view.number === n} onChange={() => setView({ number: n })} />
                {t(n === 'nr' ? 'structureTree.labelNr' : n === 'code' ? 'structureTree.labelCode' : 'structureTree.labelNone')}
              </label>
            ))}
          </div>
          <div className="schedule-tree-view-sep" />
          <div className="schedule-tree-view-heading">{t('structureTree.show')}</div>
          <label className="schedule-tree-view-option">
            <input type="checkbox" name="schedule-tree-amounts" checked={view.amounts} onChange={(e) => setView({ amounts: e.target.checked })} />
            {t('structureTree.amounts')}
          </label>
          <label className="schedule-tree-view-option">
            <input
              type="checkbox"
              name="schedule-tree-percent"
              checked={view.percent}
              onChange={(e) => setView({ percent: e.target.checked })}
              // De schermlezer leest de hint mee met het vinkje.
              aria-describedby={view.percent && narrow ? PCT_HINT_ID : undefined}
            />
            {t('structureTree.percent')}
          </label>
          {/* Anders zet je het aan en zie je niets: zeg dat het paneel breder moet. */}
          {view.percent && narrow && <div id={PCT_HINT_ID} className="schedule-tree-view-hint">{t('structureTree.percentNarrow')}</div>}
        </div>
      )}
    </div>
  );
};
