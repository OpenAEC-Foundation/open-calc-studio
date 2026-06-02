import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/state/appStore';
import { copyItemsToExcel } from '@/services/clipboard/excelClipboard';

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
    outdentItem,
    pushHistory,
    getVisibleItems,
    getSelectedRowIndices,
    setActiveCell,
    activeCol,
    updateItem,
  } = useAppStore();

  // Use filtered visible items (same as CostGrid's baseVisibleItems — excludes staart)
  const visibleItems = getVisibleItems().filter(i => !i.rowType.startsWith('staart_'));
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

  // Adjust position so menu stays within viewport
  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      menuRef.current.style.left = `${x - rect.width}px`;
    }
    if (rect.bottom > window.innerHeight) {
      menuRef.current.style.top = `${y - rect.height}px`;
    }
  }, [x, y]);

  if (!item) return null;

  const selectedItems = selectedIndices
    .filter((i) => i >= 0 && i < visibleItems.length)
    .map((i) => visibleItems[i]);
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
    const parentId = getInsertParentId();
    if (item.rowType === 'chapter') {
      // Insert as first child of this chapter
      addRegel(parentId);
    } else {
      const siblings = items.filter((i) => i.parentId === item.parentId);
      const siblingIdx = siblings.findIndex((s) => s.id === item.id);
      const prevSibling = siblingIdx > 0 ? siblings[siblingIdx - 1]?.id : undefined;
      addRegel(parentId, prevSibling);
    }
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
    pushHistory(items, t('outdent'));
    const itemsToOutdent = hasMultipleSelected ? selectedItems : [item];
    for (const it of itemsToOutdent) {
      outdentItem(it.id);
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

  const handleExcelLink = () => {
    if (onExcelLink) onExcelLink(item);
    onClose();
  };

  const handleRemoveExcelLink = () => {
    pushHistory(items, 'Verwijder Excel-link');
    updateItem(item.id, 'excelLink', null);
    onClose();
  };

  const handleQuantityLink = () => {
    if (onQuantityLink) onQuantityLink(item);
    onClose();
  };

  const handleRemoveQuantityLink = () => {
    pushHistory(items, 'Verwijder hoeveelheid-link');
    updateItem(item.id, 'quantityLink', null);
    onClose();
  };

  const hasQuantityLink = !!item.quantityLink;

  // Chapters for "Move to chapter" submenu
  const chapters = useMemo(() =>
    items.filter(i => i.rowType === 'chapter' && i.parentId === null && i.id !== item.parentId),
    [items, item.parentId]
  );
  const [showMoveSubmenu, setShowMoveSubmenu] = useState(false);
  const canMove = item.rowType !== 'chapter' && chapters.length > 0;

  const handleMoveToChapter = (chapterId: string) => {
    pushHistory(items, 'Verplaats naar hoofdstuk');
    updateItem(item.id, 'parentId', chapterId);
    onClose();
  };

  const menuItems = [
    { label: t('insertRowAbove'), action: handleInsertAbove },
    { label: t('insertRowBelow'), action: handleInsertBelow },
    { label: '-' },
    { label: deleteLabel, action: handleDelete },
    { label: '-' },
    { label: copyLabel, action: handleCopy, shortcut: 'Ctrl+C' },
    { label: t('copyToExcel', 'Kopiëren naar Excel'), action: handleCopyToExcel },
    { label: t('paste'), action: handlePaste, disabled: clipboardItems.length === 0, shortcut: 'Ctrl+V' },
    { label: '-' },
    { label: t('indent'), action: handleIndent, shortcut: 'Tab' },
    { label: t('outdent'), action: handleOutdent, shortcut: 'Shift+Tab' },
    ...(canMove ? [
      { label: '-' },
      { label: 'Verplaats naar...', action: () => setShowMoveSubmenu(!showMoveSubmenu), hasSubmenu: true },
    ] : []),
    ...(hasQuantity && onExcelLink ? [
      { label: '-' },
      { label: 'Link naar Excel...', action: handleExcelLink },
      ...(hasExcelLink ? [{ label: 'Verwijder Excel-link', action: handleRemoveExcelLink }] : []),
    ] : []),
    ...(hasQuantity && onQuantityLink ? [
      { label: '-' },
      { label: '🔗 Hoeveelheid linken (spreadsheet/PDF/IFC)...', action: handleQuantityLink },
      ...(hasQuantityLink ? [{ label: 'Verwijder hoeveelheid-link', action: handleRemoveQuantityLink }] : []),
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
