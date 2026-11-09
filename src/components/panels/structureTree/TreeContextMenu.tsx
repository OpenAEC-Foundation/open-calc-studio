import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CostItem } from '@/types/costModel';
import { allChapters, label, type TreeNumber } from './treeModel';
import type { TreeRules } from './treeRules';
import type { TreeActions } from './treeActions';

/**
 * Structuurboom, het rechtermuisknopmenu: omhoog/omlaag, "Verplaats naar"
 * (met submenu), hoofdstuk ↔ paragraaf, alles eronder open/dicht en
 * verwijderen. Welke keuzes er zijn, komt uit de regels (treeRules.ts); wat
 * een keuze doet, uit de acties (treeActions.ts).
 */

export interface MenuState { x: number; y: number; id: string }

/** Open/dicht-stand van het menu en zijn submenu's (het paneel opent het). */
export function useTreeMenu() {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [showMoveSub, setShowMoveSub] = useState(false);
  const [showParaSub, setShowParaSub] = useState(false);
  const closeMenu = () => { setMenu(null); setShowMoveSub(false); setShowParaSub(false); };
  const openMenu = (x: number, y: number, id: string) => {
    setShowMoveSub(false);
    setShowParaSub(false);
    setMenu({ x, y, id });
  };
  return { menu, showMoveSub, setShowMoveSub, showParaSub, setShowParaSub, closeMenu, openMenu };
}
export type TreeMenu = ReturnType<typeof useTreeMenu>;

interface Props {
  state: TreeMenu & { menu: MenuState };
  menuItem: CostItem | undefined;
  treeRef: React.RefObject<HTMLDivElement | null>;
  number: TreeNumber;
  items: CostItem[];
  fullByParent: Map<string | null, CostItem[]>;
  rules: TreeRules;
  actions: TreeActions;
  /** Verwijderen (met vraag); het paneel weet welke rij daarna geselecteerd wordt. */
  onDelete: (id: string) => void;
}

export const TreeContextMenu: React.FC<Props> = ({ state, menuItem, treeRef, number, items, fullByParent, rules, actions, onDelete }) => {
  const { t } = useTranslation();
  const { menu, showMoveSub, setShowMoveSub, showParaSub, setShowParaSub, closeMenu } = state;
  const { levelOf, hasChapters, siblingTarget, canMoveInto, paragraphTargets, canMakeChapter, topChapters, afterTargets, canMoveToTop, postTargets } = rules;
  const { moveAmongSiblings, moveInto, makeParagraph, makeChapter, moveChapterToTop, moveChapterAfter, setCollapsedBelow, hasTreeChildren } = actions;

  // ── Rechtermuisknopmenu ───────────────────────────────────────────────
  const menuRef = useRef<HTMLDivElement>(null);
  /** Menu dicht na een keuze (of Escape): focus terug naar de boom, anders
   *  valt hij op de pagina en doen de pijltjestoetsen niets meer. Niet bij
   *  klikken buiten het menu: dan hoort de focus bij wat je aanklikte. */
  const closeMenuToTree = () => { closeMenu(); treeRef.current?.focus({ preventScroll: true }); };
  /** Dicht zonder keuze (scrollen, venstergrootte): stond de focus in het
   *  menu, dan terug naar de boom; anders blijft hij waar hij was. */
  const closeKeepFocus = () => {
    const inside = !!menuRef.current?.contains(document.activeElement);
    if (inside) closeMenuToTree(); else closeMenu();
  };

  useEffect(() => {
    if (!menu) return;
    const onMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) closeMenu();
    };
    // Escape met de focus ín het menu regelt onMenuKeyDown (submenu eerst).
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || menuRef.current?.contains(e.target as Node)) return;
      // Deze Escape is voor het menu: andere Escape-afhandelaars niet ook laten reageren.
      e.stopPropagation();
      closeMenuToTree();
    };
    document.addEventListener('pointerdown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  // Scrollt de boom, of verandert het venster, dan klopt de plek van het
  // menu niet meer: dicht. Naar scrollen pas na één frame luisteren: bij het
  // openen schuift de boom de aangeklikte rij soms nog in beeld
  // (scrollIntoView), en dat mag het menu niet meteen weer sluiten.
  useEffect(() => {
    if (!menu) return;
    const tree = treeRef.current;
    const onScroll = () => closeKeepFocus();
    const onResize = () => closeKeepFocus();
    const onBlur = (e: FocusEvent) => { if (e.target === window) closeMenu(); };
    const frame = window.requestAnimationFrame(() => tree?.addEventListener('scroll', onScroll));
    window.addEventListener('resize', onResize);
    window.addEventListener('blur', onBlur);
    return () => {
      window.cancelAnimationFrame(frame);
      tree?.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('blur', onBlur);
    };
  }, [menu]);

  useEffect(() => {
    if (!menu || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    if (rect.right > window.innerWidth) menuRef.current.style.left = `${menu.x - rect.width}px`;
    if (rect.bottom > window.innerHeight) menuRef.current.style.top = `${menu.y - rect.height}px`;
  }, [menu]);

  // ── Toetsenbord (WAI-ARIA menu) ──────────────────────────────────────
  /** Items van één (sub)menu, in volgorde. Grijze items tellen mee: die zijn
   *  wél te bereiken (je leest waarom het niet kan), alleen niet te kiezen. */
  const itemsOf = (list: Element): HTMLElement[] =>
    [...list.querySelectorAll<HTMLElement>('[role=menuitem]')].filter((el) => el.closest('[role=menu]') === list);
  const isGrey = (el: Element) => el.getAttribute('aria-disabled') === 'true';
  const focusItem = (el: HTMLElement | undefined) => el?.focus({ preventScroll: true });
  /** Submenu met het toetsenbord geopend: na het tekenen het eerste item focussen. */
  const focusSubPending = useRef(false);

  // Menu open (ook met de muis): focus op het eerste item dat te kiezen is.
  useEffect(() => {
    if (!menu || !menuRef.current) return;
    const all = itemsOf(menuRef.current);
    focusItem(all.find((el) => !isGrey(el)) ?? all[0]);
  }, [menu]);

  useEffect(() => {
    if (!focusSubPending.current) return;
    focusSubPending.current = false;
    const sub = menuRef.current?.querySelector('.grid-context-submenu');
    if (sub) focusItem(itemsOf(sub)[0]);
  }, [showMoveSub, showParaSub]);

  const openSub = (item: HTMLElement): boolean => {
    if (isGrey(item)) return false;
    if (item.dataset.action === 'move-to') { setShowMoveSub(true); setShowParaSub(false); }
    else if (item.dataset.action === 'make-paragraph') { setShowParaSub(true); setShowMoveSub(false); }
    else return false;
    focusSubPending.current = true;
    return true;
  };

  const onMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const root = menuRef.current;
    if (!root) return;
    const item = (e.target as HTMLElement).closest<HTMLElement>('[role=menuitem]');
    const list = item?.closest<HTMLElement>('[role=menu]') ?? root;
    const inSub = list !== root;
    const all = itemsOf(list);
    const i = item ? all.indexOf(item) : -1;
    // Rechts-naar-links: dan gaat een submenu naar links open, dus ← erin.
    const rtl = getComputedStyle(root).direction === 'rtl';
    const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
    const back = rtl ? 'ArrowRight' : 'ArrowLeft';
    /** Alleen het submenu dicht; focus terug op het item dat het opende. */
    const closeSub = () => {
      setShowMoveSub(false);
      setShowParaSub(false);
      focusItem((list.previousElementSibling as HTMLElement | null) ?? undefined);
    };
    switch (e.key) {
      case 'ArrowDown': focusItem(all[i < 0 ? 0 : (i + 1) % all.length]); break;
      case 'ArrowUp': focusItem(all[i < 0 ? all.length - 1 : (i - 1 + all.length) % all.length]); break;
      case 'Home': focusItem(all[0]); break;
      case 'End': focusItem(all[all.length - 1]); break;
      case 'Enter':
      case ' ':
        // Zelf klikken (niet de browser laten doen): grijs = niets, en een
        // submenu-item opent zijn submenu met de focus erin.
        if (item && !openSub(item) && !isGrey(item) && !item.getAttribute('aria-haspopup')) item.click();
        break;
      case 'Escape':
        if (inSub) closeSub(); else closeMenuToTree();
        break;
      case 'Tab':
        closeMenuToTree();
        break;
      default:
        if (e.key === forward) { if (item) openSub(item); break; }
        if (e.key === back) { if (inSub) closeSub(); break; }
        return;
    }
    e.preventDefault();
    e.stopPropagation();
  };

  // Een open submenu ook helemaal in beeld houden: valt het aan de
  // eindkant buiten het venster (rechts, of links bij rechts-naar-links), dan
  // aan de andere kant van het menu; onderaan eruit, dan omhoog schuiven
  // (maar nooit boven het venster uit).
  useLayoutEffect(() => {
    if (!menu || (!showMoveSub && !showParaSub)) return;
    const sub = menuRef.current?.querySelector<HTMLElement>('.grid-context-submenu');
    if (!sub) return;
    const rect = sub.getBoundingClientRect();
    const rtl = getComputedStyle(sub).direction === 'rtl';
    if (rtl ? rect.left < 0 : rect.right > window.innerWidth) {
      sub.style.insetInlineStart = 'auto';
      sub.style.insetInlineEnd = '100%';
    }
    const overflow = rect.bottom - window.innerHeight + 4;
    if (overflow > 0) sub.style.top = `${-Math.max(0, Math.min(overflow, rect.top - 4))}px`;
  }, [menu, showMoveSub, showParaSub]);

  const menuChapters = useMemo(() => {
    if (!menu) return [];
    // Doelhoofdstukken voor een post of paragraaf (regels en bewakingsposten: postTargets).
    const rowType = menuItem?.rowType;
    if (rowType !== 'chapter' && rowType !== 'begrotingspost') return [];
    return allChapters(fullByParent).filter(({ item }) => canMoveInto(menu.id, item.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu, fullByParent, items]);
  const menuParagraphTargets = useMemo(
    () => (menu ? paragraphTargets(menu.id) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [menu, fullByParent, items],
  );
  const menuAfterTargets = useMemo(
    () => (menu ? afterTargets(menu.id) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [menu, fullByParent, items],
  );
  const menuPostTargets = useMemo(
    () => (menu ? postTargets(menu.id) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [menu, fullByParent, items],
  );

  if (!menuItem) return null;

  // Grijs met de reden als tooltip, niet `disabled` (zie "Verplaats naar").
  const upWhy = siblingTarget(menu.id, -1) ? '' : t('structureTree.whyFirst');
  const downWhy = siblingTarget(menu.id, 1) ? '' : t('structureTree.whyLast');

  return (
    <div
      ref={menuRef}
      className="grid-context-menu schedule-tree-menu"
      role="menu"
      aria-label={label(menuItem, menuItem.rowType === 'chapter' ? t('chapter') : '—', number)}
      style={{ left: menu.x, top: menu.y }}
      onKeyDown={onMenuKeyDown}
    >
      <button
        className="grid-context-menu-item"
        role="menuitem"
        tabIndex={-1}
        data-action="move-up"
        aria-disabled={upWhy ? true : undefined}
        data-why={upWhy || undefined}
        title={upWhy || undefined}
        onClick={() => { if (upWhy) return; moveAmongSiblings(menu.id, -1); closeMenuToTree(); }}
      >
        <span>{t('ribbon:budget.moveUp')}</span>
        <span className="grid-context-menu-shortcut">Alt+↑</span>
      </button>
      <button
        className="grid-context-menu-item"
        role="menuitem"
        tabIndex={-1}
        data-action="move-down"
        aria-disabled={downWhy ? true : undefined}
        data-why={downWhy || undefined}
        title={downWhy || undefined}
        onClick={() => { if (downWhy) return; moveAmongSiblings(menu.id, 1); closeMenuToTree(); }}
      >
        <span>{t('ribbon:budget.moveDown')}</span>
        <span className="grid-context-menu-shortcut">Alt+↓</span>
      </button>
      {/* Verplaats naar: post/paragraaf → een hoofdstuk; hoofdstuk op het
          hoogste niveau → bovenaan of ná een ander hoofdstuk (blijft
          hoofdstuk); regel/bewakingspost → een (bewakings)post. */}
      {(() => {
        const topChapter = menuItem.rowType === 'chapter' && levelOf(menuItem.id) === 0;
        const toPost = menuItem.rowType === 'regel' || menuItem.rowType === 'bewakingspost';
        const empty = topChapter
          ? menuAfterTargets.length === 0 && !canMoveToTop(menuItem.id)
          : toPost ? !menuPostTargets.some((p) => p.target) : menuChapters.length === 0;
        // Grijs zonder uitleg is raadselachtig: zeg kort waarom het niet kan.
        const why = !empty ? ''
          : topChapter ? t('structureTree.whyNoOtherChapter')
            : toPost ? t('structureTree.whyNoOtherItem')
              : menuItem.rowType === 'chapter' ? t('structureTree.whyNeedsChapterWithoutItems')
                : t('structureTree.whyNoChapterWithoutSections');
        return <>
      <div className="grid-context-menu-separator" role="separator" />
      <div style={{ position: 'relative' }}>
        <button
          className="grid-context-menu-item"
          role="menuitem"
          tabIndex={-1}
          data-action="move-to"
          aria-haspopup="menu"
          aria-expanded={showMoveSub}
          // Grijs maar niet `disabled`: een uitgeschakelde knop toont geen
          // tooltip, en de reden ("waarom kan dit niet?") staat juist daarin.
          aria-disabled={empty || undefined}
          data-why={why || undefined}
          title={why || undefined}
          onClick={() => { if (empty) return; setShowMoveSub((v) => !v); setShowParaSub(false); }}
        >
          <span>{t('grid:contextMenu.moveTo')}</span>
          <span className="grid-context-menu-shortcut schedule-tree-submenu-arrow">▸</span>
        </button>
        {showMoveSub && (
          <div className="grid-context-submenu" role="menu" style={{ position: 'absolute', insetInlineStart: '100%', top: 0 }}>
            {topChapter && <>
              <button
                className="grid-context-menu-item"
                role="menuitem"
                tabIndex={-1}
                data-move-top=""
                // Grijs met reden, niet `disabled`: zo blijft het met de pijltjes bereikbaar.
                aria-disabled={canMoveToTop(menu.id) ? undefined : true}
                title={canMoveToTop(menu.id) ? undefined : t('structureTree.whyFirst')}
                onClick={() => { if (!canMoveToTop(menu.id)) return; moveChapterToTop(menu.id); closeMenuToTree(); }}
              >
                <span>{t('structureTree.moveToTop')}</span>
              </button>
              {menuAfterTargets.length > 0 && (
                <div className="schedule-tree-menu-heading" role="presentation">{t('structureTree.placeAfter')}</div>
              )}
              {menuAfterTargets.map((ch) => (
                <button
                  key={ch.id}
                  className="grid-context-menu-item"
                  role="menuitem"
                  tabIndex={-1}
                  data-move-after={ch.id}
                  style={{ paddingInlineStart: 24 }}
                  onClick={() => { moveChapterAfter(menu.id, ch.id); closeMenuToTree(); }}
                >
                  <span>{label(ch, t('chapter'), number)}</span>
                </button>
              ))}
            </>}
            {toPost && menuPostTargets.map(({ item: p, level, target }) => (target ? (
              <button
                key={p.id}
                className="grid-context-menu-item"
                role="menuitem"
                tabIndex={-1}
                data-move-target={p.id}
                style={{ paddingInlineStart: 12 + level * 12 }}
                onClick={() => { moveInto(menu.id, p.id); closeMenuToTree(); }}
              >
                <span>{label(p, '—', number)}</span>
              </button>
            ) : (
              // Hoofdstuk (of de huidige post) als kopje: niet te kiezen.
              <div
                key={p.id}
                className="schedule-tree-menu-heading"
                role="presentation"
                style={{ paddingInlineStart: 12 + level * 12 }}
              >
                {label(p, p.rowType === 'chapter' ? t('chapter') : '—', number)}
              </div>
            )))}
            {!topChapter && !toPost && menuChapters.map(({ item: ch, level }) => (
              <button
                key={ch.id}
                className="grid-context-menu-item"
                role="menuitem"
                tabIndex={-1}
                data-move-target={ch.id}
                style={{ paddingInlineStart: 12 + level * 12 }}
                onClick={() => { moveInto(menu.id, ch.id); closeMenuToTree(); }}
              >
                <span>{label(ch, t('chapter'), number)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
        </>;
      })()}
      {/* Een hoofdstuk op het hoogste niveau ziet "Maak paragraaf van" altijd;
          kan het niet, dan grijs met de reden eronder. */}
      {(() => {
        const topChapter = menuItem.rowType === 'chapter' && levelOf(menuItem.id) === 0;
        // Eerst: is er wel een ánder hoofdstuk? Anders is "heeft paragrafen"
        // of "geen hoofdstuk zonder posten" de verkeerde reden.
        const paraWhy = !topChapter || menuParagraphTargets.length > 0 ? ''
          : topChapters().length < 2 ? t('structureTree.whyNoOtherChapter')
          : hasChapters(menuItem.id) ? t('structureTree.whyHasSections')
            : t('structureTree.whyNeedsChapterWithoutItems');
        return (topChapter || canMakeChapter(menuItem.id)) && <>
        <div className="grid-context-menu-separator" role="separator" />
        {topChapter && (
          <div style={{ position: 'relative' }}>
            <button
              className="grid-context-menu-item"
              role="menuitem"
              tabIndex={-1}
              data-action="make-paragraph"
              aria-haspopup="menu"
              aria-expanded={showParaSub}
              // Grijs met de reden als tooltip (zie "Verplaats naar").
              aria-disabled={paraWhy ? true : undefined}
              data-why={paraWhy || undefined}
              title={paraWhy || undefined}
              onClick={() => { if (paraWhy) return; setShowParaSub((v) => !v); setShowMoveSub(false); }}
            >
              <span>{t('structureTree.makeParagraphOf')}</span>
              <span className="grid-context-menu-shortcut schedule-tree-submenu-arrow">▸</span>
            </button>
            {showParaSub && (
              <div className="grid-context-submenu" role="menu" style={{ position: 'absolute', insetInlineStart: '100%', top: 0 }}>
                {menuParagraphTargets.map((ch) => (
                  <button
                    key={ch.id}
                    className="grid-context-menu-item"
                    role="menuitem"
                    tabIndex={-1}
                    data-paragraph-target={ch.id}
                    onClick={() => { makeParagraph(menu.id, ch.id); closeMenuToTree(); }}
                  >
                    <span>{label(ch, t('chapter'), number)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {canMakeChapter(menuItem.id) && (
          <button
            className="grid-context-menu-item"
            role="menuitem"
            tabIndex={-1}
            data-action="make-chapter"
            onClick={() => { makeChapter(menu.id); closeMenuToTree(); }}
          >
            <span>{t('structureTree.makeChapter')}</span>
          </button>
        )}
      </>;
      })()}
      {hasTreeChildren(menuItem.id) && <>
        <div className="grid-context-menu-separator" role="separator" />
        <button
          className="grid-context-menu-item"
          role="menuitem"
          tabIndex={-1}
          data-action="expand-below"
          onClick={() => { setCollapsedBelow(menu.id, false); closeMenuToTree(); }}
        >
          <span>{t('structureTree.expandBelow')}</span>
          <span className="grid-context-menu-shortcut">*</span>
        </button>
        <button
          className="grid-context-menu-item"
          role="menuitem"
          tabIndex={-1}
          data-action="collapse-below"
          onClick={() => { setCollapsedBelow(menu.id, true); closeMenuToTree(); }}
        >
          <span>{t('structureTree.collapseBelow')}</span>
        </button>
      </>}
      <div className="grid-context-menu-separator" role="separator" />
      <button
        className="grid-context-menu-item"
        role="menuitem"
        tabIndex={-1}
        data-action="delete"
        onClick={() => { const id = menu.id; closeMenu(); onDelete(id); treeRef.current?.focus({ preventScroll: true }); }}
      >
        <span>{t('delete')}</span>
      </button>
    </div>
  );
};
