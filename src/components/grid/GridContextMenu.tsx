import React, { useEffect, useLayoutEffect, useRef, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/state/appStore';
import { copyItemsToExcel } from '@/services/clipboard/excelClipboard';
import { isFooterRow } from '@/services/grid/gridRows';
import { canHaveMeasurementLines, hasMeasurementLines, newMeasurementLine } from '@/services/measurement/measurementLines';
import { MEASUREMENT_VIEWS } from './MeasurementLinesBlock';

interface Props {
  x: number;
  y: number;
  rowIndex: number;
  itemId?: string;
  onClose: () => void;
  onExcelLink?: (item: import('@/types/costModel').CostItem) => void;
  onQuantityLink?: (item: import('@/types/costModel').CostItem) => void;
}

export const GridContextMenu: React.FC<Props> = ({ x, y, rowIndex, itemId, onClose, onExcelLink, onQuantityLink }) => {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  const {
    items,
    addRegel,
    deleteItem,
    copyItems,
    pasteItems,
    clipboardItems,
    indentItem,
    moveItems,
    pushHistory,
    getGridRows,
    getSelectedRowIndices,
    updateItem,
    setMeasurementLines,
    toggleCollapse,
    gridView,
  } = useAppStore();

  // De gerenderde rijenlijst (incl. footers) — selectie-indices zijn
  // grid-indices en moeten op DEZE lijst gemapt worden.
  const visibleItems = getGridRows();
  // Use itemId for reliable lookup
  const item = itemId ? items.find(i => i.id === itemId) ?? visibleItems[rowIndex] : visibleItems[rowIndex];
  const selectedIndices = getSelectedRowIndices();

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Keep the menu inside the window and below the title bar (which sits on
  // top of everything): open downwards; with no room below, open upwards when
  // that fits; otherwise slide it up just enough to end at the bottom edge.
  // Scroll it when the window is lower than the menu itself. Layout effect,
  // so it never paints off-screen first.
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const margin = 8;
    el.style.maxHeight = '';
    el.style.overflowY = '';
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const titleBar = document.querySelector('.titlebar')?.getBoundingClientRect();
    const minTop = (titleBar && titleBar.bottom > 0 ? titleBar.bottom : 0) + margin;
    const maxBottom = vh - margin;
    let left = x + rect.width > vw - margin ? x - rect.width : x;
    left = Math.max(margin, Math.min(left, vw - rect.width - margin));
    let top: number;
    if (rect.height > maxBottom - minTop) {
      top = minTop;
      el.style.maxHeight = `${maxBottom - minTop}px`;
      el.style.overflowY = 'auto';
    } else if (y + rect.height <= maxBottom) {
      top = y;
    } else if (y - rect.height >= minTop) {
      top = y - rect.height;
    } else {
      top = maxBottom - rect.height;
    }
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }, [x, y]);

  if (!item) return null;

  const selectedItems = selectedIndices
    .filter((i) => i >= 0 && i < visibleItems.length)
    .map((i) => visibleItems[i])
    .filter((it) => !isFooterRow(it.id));
  const hasMultipleSelected = selectedItems.length > 1;

  // Find the parent for inserting a new regel.
  // If the item is a chapter, insert under that chapter.
  // If the item has a parentId, use that parent.
  // If the item is top-level non-chapter, find or create a suitable parent.
  const getInsertParentId = (): string => {
    if (item.rowType === 'chapter') return item.id;
    if (item.parentId) return item.parentId;
    // Top-level item without parent — shouldn't happen but fallback
    return item.id;
  };

  const handleInsertAbove = () => {
    pushHistory(items, t('insertRowAbove'));
    const newId = addRegel(getInsertParentId());
    // addRegel zet de regel achteraan; daarna op zijn plek zetten. Op een
    // hoofdstuk wordt het het eerste kind, anders komt hij direct boven het
    // item, ook als dat het eerste kind is (knownbug 31). Een post op het
    // hoogste niveau (zonder ouder) krijgt de regel als eerste kind: een
    // rekenregel hoort niet los op het hoogste niveau.
    const asFirstChild = item.rowType === 'chapter' || !item.parentId;
    if (newId) moveItems([newId], item.id, asFirstChild ? 'inside' : 'before');
    onClose();
  };

  const handleInsertBelow = () => {
    pushHistory(items, t('insertRowBelow'));
    if (item.rowType === 'chapter') {
      // Insert as last child of this chapter
      const children = items.filter(i => i.parentId === item.id);
      const lastChild = children[children.length - 1];
      addRegel(item.id, lastChild?.id);
    } else {
      addRegel(getInsertParentId(), item.id);
    }
    onClose();
  };

  const handleDelete = () => {
    pushHistory(items, t('delete'));
    // For single selection, use `item` (resolved by itemId — always correct).
    // For multi-select, use selectedItems array.
    const itemsToDelete = hasMultipleSelected ? selectedItems : [item];
    for (let i = itemsToDelete.length - 1; i >= 0; i--) {
      deleteItem(itemsToDelete[i].id);
    }
    onClose();
  };

  const handleCopy = () => {
    const itemsToCopy = hasMultipleSelected ? selectedItems : [item];
    copyItems(itemsToCopy);
    // Also put TSV on system clipboard for Excel paste
    copyItemsToExcel(itemsToCopy);
    onClose();
  };

  const handleCopyToExcel = () => {
    const itemsToCopy = hasMultipleSelected ? selectedItems : [item];
    copyItemsToExcel(itemsToCopy);
    onClose();
  };

  const handlePaste = () => {
    pasteItems();
    onClose();
  };

  const handleIndent = () => {
    pushHistory(items, t('indent'));
    const itemsToIndent = hasMultipleSelected ? selectedItems : [item];
    for (const it of itemsToIndent) {
      indentItem(it.id);
    }
    onClose();
  };

  const handleOutdent = () => {
    const itemsToOutdent = hasMultipleSelected ? selectedItems : [item];
    // Ouders die zelf uitspringen (ze hebben een ouder); hun kinderen gaan mee.
    const moving = new Set(itemsToOutdent.filter((it) => it.parentId).map((it) => it.id));
    // Per ouder in één keer direct ná die ouder zetten, in de huidige volgorde.
    // Eén voor één uitspringen draaide de volgorde om (knownbug 34).
    const byParent = new Map<string, string[]>();
    for (const it of itemsToOutdent) {
      if (!it.parentId || moving.has(it.parentId)) continue;
      const list = byParent.get(it.parentId) ?? [];
      list.push(it.id);
      byParent.set(it.parentId, list);
    }
    if (byParent.size > 0) {
      pushHistory(items, t('outdent'));
      for (const [parentId, group] of byParent) moveItems(group, parentId, 'after');
    }
    onClose();
  };

  const deleteLabel = hasMultipleSelected
    ? t('deleteRows', { count: selectedItems.length })
    : t('delete');
  const copyLabel = hasMultipleSelected
    ? t('copyRows', { count: selectedItems.length })
    : t('copy');

  // Excel link: available for rows that have a quantity field
  const hasQuantity = ['begrotingspost', 'bewakingspost', 'regel', 'tekstregel'].includes(item.rowType);
  const hasExcelLink = !!item.excelLink;

  // Een koppeling vervangt de meetregels (#96): eerst vragen.
  const linkMayReplaceLines = () =>
    !item.measurementLines?.length || window.confirm(t('grid:measurement.linkReplacesConfirm'));

  const handleExcelLink = () => {
    if (!linkMayReplaceLines()) { onClose(); return; }
    if (onExcelLink) onExcelLink(item);
    onClose();
  };

  const handleRemoveExcelLink = () => {
    pushHistory(items, t('grid:contextMenu.removeExcelLink'));
    updateItem(item.id, 'excelLink', null);
    onClose();
  };

  const handleQuantityLink = () => {
    if (!linkMayReplaceLines()) { onClose(); return; }
    if (onQuantityLink) onQuantityLink(item);
    onClose();
  };

  const handleRemoveQuantityLink = () => {
    pushHistory(items, t('grid:contextMenu.removeQuantityLink'));
    updateItem(item.id, 'quantityLink', null);
    onClose();
  };

  const hasQuantityLink = !!item.quantityLink;

  // Meetregels (#96). De eerste regel krijgt de hoeveelheid die er al stond
  // als aantal, zodat het totaal niet verspringt. Een gekoppelde hoeveelheid
  // (Excel, PDF, IFC) verliest die koppeling: eerst vragen.
  const measurementsHere = MEASUREMENT_VIEWS.has(gridView) && canHaveMeasurementLines(item);
  const handleAddMeasurementLines = () => {
    if ((item.excelLink || item.quantityLink) && !window.confirm(t('grid:measurement.dropLinkConfirm'))) { onClose(); return; }
    pushHistory(items, t('grid:undo.measurementLines'));
    const qty = item.quantity ?? 0;
    setMeasurementLines(item.id, [newMeasurementLine(qty !== 0 ? { count: qty } : {})]);
    if (item.isCollapsed) toggleCollapse(item.id);
    onClose();
  };
  const handleRemoveMeasurementLines = () => {
    if (!window.confirm(t('grid:measurement.removeConfirm'))) return;
    pushHistory(items, t('grid:undo.measurementLines'));
    setMeasurementLines(item.id, null);
    onClose();
  };

  // Btw-tarief per onderdeel: hoofdstukken, posten en regels. Kinderen erven
  // het tarief van hun ouder (default hoog).
  const canSetBtw = ['chapter', 'begrotingspost', 'bewakingspost', 'regel'].includes(item.rowType);
  const handleSetBtwTarief = (tarief: 'hoog' | 'laag' | null) => {
    pushHistory(items, t('grid:undo.vatRate'));
    const targets = hasMultipleSelected ? selectedItems : [item];
    for (const it of targets) {
      if (['chapter', 'begrotingspost', 'bewakingspost', 'regel'].includes(it.rowType)) {
        updateItem(it.id, 'btwTarief', tarief);
      }
    }
    onClose();
  };
  const btwCheck = (v: 'hoog' | 'laag' | null) => ((item.btwTarief ?? null) === v ? '✓ ' : ' ');

  // Chapters for "Move to chapter" submenu
  const chapters = useMemo(() =>
    items.filter(i => i.rowType === 'chapter' && i.parentId === null && i.id !== item.parentId),
    [items, item.parentId]
  );
  const [showMoveSubmenu, setShowMoveSubmenu] = useState(false);
  const canMove = item.rowType !== 'chapter' && chapters.length > 0;

  const handleMoveToChapter = (chapterId: string) => {
    pushHistory(items, t('grid:undo.moveToChapter'));
    // Alle geselecteerde rijen, achteraan in het hoofdstuk, met de juiste
    // diepte. updateItem('parentId') zette het item eerst of laatst, afhankelijk
    // van de richting, en negeerde een meervoudige selectie (knownbug 35).
    // Hoofdstukken gaan niet mee (zoals canMove): anders wordt een heel
    // hoofdstuk een subhoofdstuk van het doel.
    const ids = (hasMultipleSelected ? selectedItems : [item])
      .filter((it) => it.rowType !== 'chapter')
      .map((it) => it.id);
    const lastChild = useAppStore.getState().items
      .filter((i) => i.parentId === chapterId && !ids.includes(i.id))
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .pop();
    if (ids.length > 0) moveItems(ids, lastChild?.id ?? chapterId, lastChild ? 'after' : 'inside');
    onClose();
  };

  const menuItems = [
    { label: t('insertRowAbove'), action: handleInsertAbove },
    { label: t('insertRowBelow'), action: handleInsertBelow },
    { label: '-' },
    { label: deleteLabel, action: handleDelete },
    { label: '-' },
    { label: copyLabel, action: handleCopy, shortcut: 'Ctrl+C' },
    { label: t('grid:contextMenu.copyToExcel'), action: handleCopyToExcel },
    { label: t('paste'), action: handlePaste, disabled: clipboardItems.length === 0, shortcut: 'Ctrl+V' },
    { label: '-' },
    { label: t('indent'), action: handleIndent, shortcut: 'Tab' },
    { label: t('outdent'), action: handleOutdent, shortcut: 'Shift+Tab' },
    ...(canMove ? [
      { label: '-' },
      { label: t('grid:contextMenu.moveTo'), action: () => setShowMoveSubmenu(!showMoveSubmenu), hasSubmenu: true },
    ] : []),
    ...(hasQuantity && onExcelLink ? [
      { label: '-' },
      { label: t('grid:contextMenu.linkToExcel'), action: handleExcelLink },
      ...(hasExcelLink ? [{ label: t('grid:contextMenu.removeExcelLink'), action: handleRemoveExcelLink }] : []),
    ] : []),
    ...(hasQuantity && onQuantityLink ? [
      { label: '-' },
      { label: t('grid:contextMenu.linkQuantity'), action: handleQuantityLink },
      ...(hasQuantityLink ? [{ label: t('grid:contextMenu.removeQuantityLink'), action: handleRemoveQuantityLink }] : []),
    ] : []),
    ...(measurementsHere ? [
      { label: '-' },
      hasMeasurementLines(item)
        ? { label: t('grid:measurement.removeLines'), action: handleRemoveMeasurementLines }
        : { label: t('grid:measurement.addLines'), action: handleAddMeasurementLines },
    ] : []),
    ...(canSetBtw ? [
      { label: '-' },
      { label: `${btwCheck(null)}${t('grid:contextMenu.vatInherit')}`, action: () => handleSetBtwTarief(null) },
      { label: `${btwCheck('hoog')}${t('grid:contextMenu.vatHigh')}`, action: () => handleSetBtwTarief('hoog') },
      { label: `${btwCheck('laag')}${t('grid:contextMenu.vatLow')}`, action: () => handleSetBtwTarief('laag') },
    ] : []),
  ];

  return (
    <div
      ref={menuRef}
      className="grid-context-menu"
      style={{ left: x, top: y }}
    >
      {menuItems.map((mi, i) =>
        mi.label === '-' ? (
          <div key={i} className="grid-context-menu-separator" />
        ) : (
          <button
            key={i}
            className={`grid-context-menu-item${(mi as any).hasSubmenu ? ' has-submenu' : ''}`}
            disabled={mi.disabled}
            onClick={mi.action}
          >
            <span>{mi.label}</span>
            {mi.shortcut && <span className="grid-context-menu-shortcut">{mi.shortcut}</span>}
            {(mi as any).hasSubmenu && <span className="grid-context-menu-shortcut">▸</span>}
          </button>
        )
      )}
      {showMoveSubmenu && (
        <div className="grid-context-submenu" style={{ left: '100%', top: 0, position: 'absolute' }}>
          {chapters.map(ch => (
            <button
              key={ch.id}
              className="grid-context-menu-item"
              onClick={() => handleMoveToChapter(ch.id)}
            >
              <span>{ch.code ? `${ch.code}. ` : ''}{ch.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
