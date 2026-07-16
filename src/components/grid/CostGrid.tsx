import React, { useCallback, useRef, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import './grid.css';
import { GridHeader } from './GridHeader';
import { GridRow } from './GridRow';
import { GridCellEditor } from './GridCellEditor';
import { GridContextMenu } from './GridContextMenu';
import FindReplaceDialog from './FindReplaceDialog';
import { useGridVirtualizer } from './useGridVirtualizer';
import { useGridNavigation } from './useGridNavigation';
import { useGridEditing } from './useGridEditing';
import { useAppStore } from '@/state/appStore';
import { ROW_HEIGHT, getColumnsForView, isCellEditable, isColumnHidden } from './gridConstants';
import { getKostprijs } from '@/services/calculation/calculator';
import { isItemChangedSince, changedFieldsSince } from '@/services/history/itemHistory';
import { formatCurrency } from '@/utils/formatting';
import type { CostItem, ExcelLink, Branch } from '@/types/costModel';

// Stable empty-array references for Zustand selectors — without these,
// `s.schedule.branches ?? []` returns a fresh array each render which
// triggers infinite re-render loops via useSyncExternalStore.
const EMPTY_BRANCHES: Branch[] = [];
import ExcelCellPicker from '@/components/common/ExcelCellPicker';
import { QuantityPicker } from '@/components/common/QuantityPicker';
import { CodePickerModal } from './CodePickerModal';
import type { CodeEntry } from '@/data/codeLibrary';

const HEADER_HEIGHT = ROW_HEIGHT * 2;

/** Compute resource breakdown totals for each item (used in WpCalc view).
 *  In WpCalc, each regel has BOTH a loon component (norm × tarief) and a
 *  material/resource component. The resource columns split by type. */
function computeResourceTotals(items: CostItem[]): Map<string, Record<string, number>> {
  const map = new Map<string, Record<string, number>>();
  const childrenByParent = new Map<string, CostItem[]>();

  for (const item of items) {
    if (item.parentId) {
      const list = childrenByParent.get(item.parentId) ?? [];
      list.push(item);
      childrenByParent.set(item.parentId, list);
    }
  }

  function getTotals(itemId: string): Record<string, number> {
    if (map.has(itemId)) return map.get(itemId)!;

    const item = items.find((i) => i.id === itemId);
    if (!item) return {};

    const totals: Record<string, number> = {
      materiaalTotal: 0,
      arbeidTotal: 0,
      materieelTotal: 0,
      onderaannemingTotal: 0,
      stelpostTotal: 0,
    };

    if (item.rowType === 'regel') {
      const qty = item.quantity || 0;
      const lab = item.laborPrice ?? 0;
      const nup = item.normUnitPrice ?? 0;
      // Loon = laborPrice × aantal
      const loon = lab * qty;
      // Materiaalprijs = normUnitPrice × aantal
      const matKosten = nup * qty;

      // For onderaannemer: entire amount goes to onderaanneming, no loon
      switch (item.resourceType) {
        case 'onderaannemer':
          totals.onderaannemingTotal = item.total || 0;
          break;
        case 'materieel':
          totals.arbeidTotal = loon;
          totals.materieelTotal = matKosten;
          break;
        case 'overig':
          totals.arbeidTotal = loon;
          totals.stelpostTotal = matKosten;
          break;
        default:
          totals.arbeidTotal = loon;
          totals.materiaalTotal = matKosten;
          break;
      }
    } else {
      const children = childrenByParent.get(itemId) ?? [];
      for (const child of children) {
        const childTotals = getTotals(child.id);
        for (const key of Object.keys(totals)) {
          totals[key] += childTotals[key] || 0;
        }
      }
    }

    map.set(itemId, totals);
    return totals;
  }

  for (const item of items) {
    getTotals(item.id);
  }

  return map;
}

/** Create a synthetic chapter footer item for totals row */
function makeChapterFooter(chapterId: string): CostItem {
  return {
    id: `footer:${chapterId}`,
    parentId: chapterId,
    sortOrder: 999999,
    code: '',
    description: '+',
    unit: 'st',
    quantity: null,
    materialPrice: null,
    laborPrice: null,
    unitPrice: 0,
    total: 0,
    isCollapsed: false,
    depth: 0,
    notes: '',
    ifcGuid: '',
    rowType: 'tekstregel',  // will be styled differently via chapterFooterIds
    staartPercentage: null,
    nr: '',
    normQuantity: null,
    normFactor: null,
    normDivisor: null,
    normUnitPrice: null,
    resourceType: null,
    resourceLibraryId: null,
    verrekenbaar: null,
    tariefGroep: null,
  };
}

export const CostGrid: React.FC = () => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const {
    items,
    activeRow,
    activeCol,
    isEditing,
    selectionStart,
    selectionEnd,
    cellSelectionStart,
    cellSelectionEnd,
    setCellSelection,
    scrollTop,
    viewportHeight,
    showHoeveelheid,
    gridZoom,
    setGridZoom,
    setScrollTop,
    setViewportHeight,
    setActiveCell,
    setActiveCellExtend,
    startEditing,
    toggleCollapse,
    getVisibleItems,
    addItem,
    pushHistory,
  } = useAppStore();

  const moveItems = useAppStore((s) => s.moveItems);
  const getSelectedRowIndices = useAppStore((s) => s.getSelectedRowIndices);

  // Track whether mouse is being dragged for cell selection
  const isDraggingRef = useRef(false);

  const gridView = useAppStore((s) => s.gridView);
  const columnWidths = useAppStore((s) =>
    s.gridView === 'wpcalc' ? s.wpcalcColumnWidths
    : s.gridView === 'inschrijfstaat' ? s.inschrijfstaatColumnWidths
    : s.columnWidths
  );

  const branchesEnabled = useAppStore(s => s.schedule.branchesEnabled ?? false);
  const columns = useMemo(() => getColumnsForView(gridView, branchesEnabled), [gridView, branchesEnabled]);
  const changeTrackingSince = useAppStore(s => s.schedule.changeTrackingSince);
  const changeDisplayMode = useAppStore(s => s.schedule.changeDisplayMode ?? 'row');

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; rowIndex: number; itemId?: string } | null>(null);
  const [dropHint, setDropHint] = useState<{ rowId: string; pos: 'before' | 'after' | 'inside' } | null>(null);
  const [draggingIds, setDraggingIds] = useState<Set<string>>(new Set());
  const [excelPickerItem, setExcelPickerItem] = useState<CostItem | null>(null);
  const [quantityLinkItem, setQuantityLinkItem] = useState<CostItem | null>(null);
  const [codePickerItem, setCodePickerItem] = useState<CostItem | null>(null);

  const activeBranchId = useAppStore(s => s.schedule.activeBranchId);
  const allBranches = useAppStore(s => s.schedule.branches ?? EMPTY_BRANCHES);
  const baseVisibleItems = useMemo(() => {
    let visible = getVisibleItems().filter(i => !i.rowType.startsWith('staart_'));
    // Branch filter: if activeBranchId set, show only items matching or in ancestor chain
    if (branchesEnabled && activeBranchId) {
      // Collect active branch and all ancestors (main chain is always visible)
      const ancestors = new Set<string>(['main']);
      let cur: string | null | undefined = activeBranchId;
      while (cur) {
        ancestors.add(cur);
        const b = allBranches.find(b => b.id === cur);
        cur = b?.parentId;
      }
      visible = visible.filter(i => {
        const bid = i.branchId ?? 'main';
        return ancestors.has(bid);
      });
    }
    return visible;
  }, [items, getVisibleItems, branchesEnabled, activeBranchId, allBranches]);

  // In wpcalc view, insert chapter footer rows after each chapter's last visible child
  const { visibleItems, chapterFooterIds } = useMemo(() => {
    if (gridView !== 'wpcalc') return { visibleItems: baseVisibleItems, chapterFooterIds: new Set<string>() };

    const footerIds = new Set<string>();
    const result: CostItem[] = [];

    // Find which chapters have children in the visible list
    const chapterLastChild = new Map<string, number>(); // chapterId → last index in baseVisibleItems
    for (let i = 0; i < baseVisibleItems.length; i++) {
      const item = baseVisibleItems[i];
      // Walk up to find the root chapter
      let rootChapterId: string | null = null;
      if (item.rowType === 'chapter' && !item.parentId) {
        rootChapterId = item.id;
      } else {
        // Find root chapter via parentId chain
        let current = item;
        while (current.parentId) {
          const parent = items.find(it => it.id === current.parentId);
          if (!parent) break;
          if (parent.rowType === 'chapter' && !parent.parentId) {
            rootChapterId = parent.id;
            break;
          }
          current = parent;
        }
      }
      if (rootChapterId) {
        chapterLastChild.set(rootChapterId, i);
      }
    }

    // Build result with footer rows inserted
    let currentChapterId: string | null = null;
    for (let i = 0; i < baseVisibleItems.length; i++) {
      const item = baseVisibleItems[i];

      // Detect new root chapter
      if (item.rowType === 'chapter' && !item.parentId) {
        // Insert footer for previous chapter (if any)
        if (currentChapterId) {
          const footer = makeChapterFooter(currentChapterId);
          footerIds.add(footer.id);
          result.push(footer);
        }
        currentChapterId = item.id;
      }

      result.push(item);
    }
    // Insert footer for last chapter
    if (currentChapterId) {
      const footer = makeChapterFooter(currentChapterId);
      footerIds.add(footer.id);
      result.push(footer);
    }

    return { visibleItems: result, chapterFooterIds: footerIds };
  }, [baseVisibleItems, items, gridView]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const target = (e.target as HTMLElement).closest('[data-row-index]');
      if (!target) return;
      const rowIndex = parseInt(target.getAttribute('data-row-index')!, 10);
      if (isNaN(rowIndex) || rowIndex < 0 || rowIndex >= visibleItems.length) return;
      const clickedItemForCtx = visibleItems[rowIndex];
      if (selectionStart != null && selectionEnd != null) {
        const min = Math.min(selectionStart, selectionEnd);
        const max = Math.max(selectionStart, selectionEnd);
        if (rowIndex < min || rowIndex > max) {
          setActiveCell(rowIndex, activeCol, clickedItemForCtx?.id);
        }
      } else {
        setActiveCell(rowIndex, activeCol, clickedItemForCtx?.id);
      }
      // Correct for CSS zoom: clientX/Y are in viewport coords, but the menu
      // is rendered inside the zoomed container, so divide by zoom factor
      const zoomFactor = gridZoom / 100;
      // Store the item ID instead of rowIndex to avoid index mismatch
      // between CostGrid's filtered visibleItems and GridContextMenu's getVisibleItems()
      const clickedItem = visibleItems[rowIndex];
      if (!clickedItem) return;
      setContextMenu({ x: e.clientX / zoomFactor, y: e.clientY / zoomFactor, rowIndex, itemId: clickedItem.id });
    },
    [visibleItems, setActiveCell, activeCol, selectionStart, selectionEnd, gridZoom]
  );

  // Effective column widths: hide 'hoeveelheid' column when toggle is off,
  // and hide any column the user has hidden via the column header menu.
  const hiddenColumns = useAppStore((s) => s.hiddenColumns);
  const effectiveColumnWidths = useMemo(() => {
    return columns.map((col, i) => {
      if (col.key === 'hoeveelheid' && !showHoeveelheid) return 0;
      if (isColumnHidden(hiddenColumns, gridView, col.key)) return 0;
      return columnWidths[i] ?? col.width;
    });
  }, [columns, columnWidths, showHoeveelheid, hiddenColumns, gridView]);

  // Compute resource totals (only in wpcalc view)
  const resourceTotalsMap = useMemo(() => {
    if (gridView !== 'wpcalc') return null;
    return computeResourceTotals(items);
  }, [gridView, items]);

  const getRowHeight = useCallback((index: number) => {
    const item = visibleItems[index];
    if (item?.rowType === 'witregel') {
      const lineCount = Math.max(1, (item.description.match(/\n/g) || []).length + 1);
      return Math.max(ROW_HEIGHT, lineCount * ROW_HEIGHT);
    }
    // In wpcalc view, chapters get 8px top spacing (except the first)
    if (gridView === 'wpcalc' && item?.rowType === 'chapter' && !item.parentId && index > 0) {
      return ROW_HEIGHT + 8;
    }
    return ROW_HEIGHT;
  }, [visibleItems, gridView]);

  const { startIndex, endIndex, totalHeight, offsetY, rowOffsets } = useGridVirtualizer(
    visibleItems.length,
    scrollTop,
    viewportHeight,
    getRowHeight,
  );
  const { handleKeyDown } = useGridNavigation(visibleItems.length, visibleItems);
  const { commitEdit } = useGridEditing();

  // Compute normalized cell selection bounds
  const cellSelBounds = useMemo(() => {
    if (!cellSelectionStart || !cellSelectionEnd) return null;
    return {
      minRow: Math.min(cellSelectionStart.row, cellSelectionEnd.row),
      maxRow: Math.max(cellSelectionStart.row, cellSelectionEnd.row),
      minCol: Math.min(cellSelectionStart.col, cellSelectionEnd.col),
      maxCol: Math.max(cellSelectionStart.col, cellSelectionEnd.col),
    };
  }, [cellSelectionStart, cellSelectionEnd]);

  const selectedRowSet = useMemo(() => {
    const set = new Set<number>();
    if (selectionStart != null && selectionEnd != null) {
      const min = Math.min(selectionStart, selectionEnd);
      const max = Math.max(selectionStart, selectionEnd);
      for (let i = min; i <= max; i++) {
        set.add(i);
      }
    }
    return set;
  }, [selectionStart, selectionEnd]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setViewportHeight(entry.contentRect.height - HEADER_HEIGHT);
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [setViewportHeight, ROW_HEIGHT]);

  // Ctrl+scroll zoom (non-passive for preventDefault)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -5 : 5;
        setGridZoom(gridZoom + delta);
      }
    };
    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, [gridZoom, setGridZoom]);

  // Auto-scroll to keep active row visible
  useEffect(() => {
    const container = containerRef.current;
    if (!container || isEditing) return;
    const currentScroll = container.scrollTop;
    const rowTop = rowOffsets[activeRow] ?? activeRow * ROW_HEIGHT;
    const rowBottom = rowTop + getRowHeight(activeRow);
    const visibleTop = currentScroll + HEADER_HEIGHT;
    const visibleBottom = currentScroll + container.clientHeight;
    if (rowTop < visibleTop) {
      container.scrollTop = Math.max(0, rowTop - HEADER_HEIGHT);
    } else if (rowBottom > visibleBottom) {
      container.scrollTop = rowBottom - container.clientHeight + HEADER_HEIGHT;
    }
  }, [activeRow, isEditing]);

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      setScrollTop((e.target as HTMLDivElement).scrollTop);
    },
    [setScrollTop]
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -10 : 10;
        setGridZoom(gridZoom + delta);
      }
    },
    [gridZoom, setGridZoom]
  );


  const handleCellClick = useCallback(
    (row: number, col: number, shiftKey: boolean) => {
      // Footerrijen: alleen de uren-cel (hoeveelheid) is interactief — klik
      // opent direct de cel-editor (uren hoofdstuk naar rato).
      const item = visibleItems[row];
      if (item?.id.startsWith('footer:')) {
        if (columns[col]?.key === 'hoeveelheid' && !shiftKey) {
          setActiveCell(row, col, item.id);
          requestAnimationFrame(() => startEditing());
        }
        return;
      }

      if (shiftKey) {
        setActiveCellExtend(row, col);
      } else {
        setActiveCell(row, col, item?.id);
        const colDef = columns[col];
        if (colDef?.editable && item && isCellEditable(colDef.key, item.rowType, gridView)) {
          requestAnimationFrame(() => startEditing());
        }
      }
    },
    [columns, setActiveCell, setActiveCellExtend, startEditing, visibleItems]
  );

  const updateItem = useAppStore((s) => s.updateItem);

  // Map resource column keys to resourceType values
  const RESOURCE_COL_MAP: Record<string, string> = {
    materiaalTotal: 'materiaal',
    arbeidTotal: 'arbeid',
    materieelTotal: 'materieel',
    stelpostTotal: 'overig',
    onderaannemingTotal: 'onderaannemer',
  };

  const handleCellDoubleClick = useCallback(
    (row: number, col: number) => {
      const item = visibleItems[row];
      setActiveCell(row, col, item?.id);
      const colDef = columns[col];
      if (!item) return;
      // Footerrijen: alleen de uren-cel start een edit
      if (item.id.startsWith('footer:')) {
        if (colDef?.key === 'hoeveelheid') startEditing();
        return;
      }

      // Nr-kolom: dubbelklik opent de coderingskiezer (STABU / NL-SfB) i.p.v.
      // tekstinvoer, zodat je een standaardcode kunt kiezen of er zelf één toevoegt.
      if (colDef?.key === 'rowNumber' && item.rowType !== 'witregel') {
        setCodePickerItem(item);
        return;
      }

      // In wpcalc view: double-click on resource column sets resourceType
      if (gridView === 'wpcalc' && item.rowType === 'regel' && RESOURCE_COL_MAP[colDef.key]) {
        pushHistory(items, t('changeResourceType'));
        updateItem(item.id, 'resourceType', RESOURCE_COL_MAP[colDef.key]);
        return;
      }

      if (colDef?.editable && item && isCellEditable(colDef.key, item.rowType, gridView)) {
        startEditing();
      }
    },
    [columns, setActiveCell, startEditing, visibleItems, gridView, updateItem, pushHistory, items]
  );

  const handleCellMouseDown = useCallback(
    (row: number, col: number, shiftKey: boolean) => {
      const item = visibleItems[row];
      if (item?.id.startsWith('footer:')) return;
      if (shiftKey && cellSelectionStart) {
        // Extend from existing start
        setCellSelection(cellSelectionStart, { row, col });
      } else {
        setCellSelection({ row, col }, { row, col });
      }
      isDraggingRef.current = true;
    },
    [visibleItems, cellSelectionStart, setCellSelection]
  );

  const handleCellMouseEnter = useCallback(
    (row: number, col: number) => {
      if (!isDraggingRef.current || !cellSelectionStart) return;
      setCellSelection(cellSelectionStart, { row, col });
    },
    [cellSelectionStart, setCellSelection]
  );

  // Global mouseup to end drag selection
  useEffect(() => {
    const handleMouseUp = () => {
      isDraggingRef.current = false;
    };
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, []);

  const editorOffsetX = useMemo(() => {
    let x = 0;
    for (let i = 0; i < activeCol; i++) {
      x += effectiveColumnWidths[i];
    }
    return x;
  }, [activeCol, effectiveColumnWidths]);

  const editorWidth = effectiveColumnWidths[activeCol] ?? columns[activeCol]?.width ?? 100;

  const visibleSlice = useMemo(
    () => visibleItems.slice(startIndex, endIndex + 1),
    [visibleItems, startIndex, endIndex]
  );

  // Hide total on container rows that have exactly one container child with the same total
  const hideTotalSet = useMemo(() => {
    const set = new Set<string>();
    const childrenMap = new Map<string, typeof items>();
    for (const item of items) {
      if (item.parentId) {
        const list = childrenMap.get(item.parentId) ?? [];
        list.push(item);
        childrenMap.set(item.parentId, list);
      }
    }
    for (const item of items) {
      if (item.rowType !== 'chapter' && item.rowType !== 'begrotingspost') continue;
      const children = (childrenMap.get(item.id) ?? [])
        .filter(c => c.rowType !== 'tekstregel' && c.rowType !== 'witregel');
      if (children.length === 1 && Math.abs(children[0].total - item.total) < 0.01) {
        set.add(item.id);
      }
    }
    return set;
  }, [items]);

  // Zoeken & vervangen (Ctrl+F) — zwevend paneel rechtsboven in het grid
  const [showFindReplace, setShowFindReplace] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        setShowFindReplace(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const insertRegelBelow = useAppStore((s) => s.insertRegelBelow);
  const handleAddRow = useCallback(
    (rowIndex: number) => {
      const item = visibleItems[rowIndex];
      if (!item || item.id.startsWith('footer:')) return;
      pushHistory(items, t('addRow'));
      insertRegelBelow(item.id);
    },
    [visibleItems, items, pushHistory, insertRegelBelow]
  );

  const handleContainerKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (visibleItems.length === 0 && !e.ctrlKey && !e.metaKey) {
        if (e.key === 'Enter' || (e.key.length === 1 && !e.altKey)) {
          e.preventDefault();
          const newId = addItem(null);
          setActiveCell(0, 1, newId);
          if (e.key.length === 1) startEditing(e.key);
          return;
        }
      }
      handleKeyDown(e);
    },
    [visibleItems.length, handleKeyDown, addItem, setActiveCell, startEditing]
  );

  // Drag-and-drop handlers
  // ── Pointer-gebaseerd rij-slepen ──
  // HTML5 drag&drop werkt niet binnen Tauri-webviews zolang de native
  // drag-drop-handler aanstaat (die is nodig om bestanden de app in te
  // slepen). Daarom slepen we rijen zelf met pointer-events via de gutter.
  const dropHintRef = useRef<typeof dropHint>(null);
  useEffect(() => { dropHintRef.current = dropHint; }, [dropHint]);

  const handleRowPointerDown = useCallback((e: React.PointerEvent, rowIndex: number, itemId: string) => {
    if (e.button !== 0) return;
    const selIndices = getSelectedRowIndices();
    let ids: string[];
    if (selIndices.includes(rowIndex) && selIndices.length > 1) {
      ids = selIndices
        .map((i) => visibleItems[i]?.id)
        .filter((id): id is string => !!id && !id.startsWith('footer:'));
    } else {
      ids = [itemId];
    }
    const idSet = new Set(ids);
    let started = false;
    const startY = e.clientY;

    const onMove = (ev: PointerEvent) => {
      if (!started) {
        if (Math.abs(ev.clientY - startY) < 4) return; // sleep-drempel
        started = true;
        setDraggingIds(new Set(ids));
      }
      ev.preventDefault();
      const rowEl = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-row-index]') as HTMLElement | null;
      if (!rowEl) { setDropHint(null); return; }
      const idx = Number(rowEl.getAttribute('data-row-index'));
      const target = visibleItems[idx];
      if (!target || target.id.startsWith('footer:') || idSet.has(target.id)) { setDropHint(null); return; }
      const rect = rowEl.getBoundingClientRect();
      const y = ev.clientY - rect.top;
      const h = rect.height;
      const canInside = target.rowType === 'chapter' || target.rowType === 'begrotingspost' || target.rowType === 'bewakingspost';
      let pos: 'before' | 'after' | 'inside';
      if (canInside) pos = y < h / 3 ? 'before' : y > (2 * h) / 3 ? 'after' : 'inside';
      else pos = y < h / 2 ? 'before' : 'after';
      setDropHint((prev) => (prev?.rowId === target.id && prev.pos === pos ? prev : { rowId: target.id, pos }));
      // Auto-scroll bij de randen
      const scrollEl = containerRef.current;
      if (scrollEl) {
        const r = scrollEl.getBoundingClientRect();
        if (ev.clientY - r.top < 40 + HEADER_HEIGHT) scrollEl.scrollTop = Math.max(0, scrollEl.scrollTop - 10);
        else if (r.bottom - ev.clientY < 40) scrollEl.scrollTop += 10;
      }
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      const hint = dropHintRef.current;
      setDropHint(null);
      setDraggingIds(new Set());
      if (started && hint) {
        pushHistory(items, 'Verplaats rij');
        moveItems(ids, hint.rowId, hint.pos);
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [getSelectedRowIndices, visibleItems, moveItems, pushHistory, items]);

  const isWpcalcView = gridView === 'wpcalc';
  // The grid is its own bottom-nav tab now; "Uren & Staart" is a separate
  // content view (UrenStaartView), so the grid always renders here.
  const showGrid = true;

  return (
    <div className={`cost-grid-wrapper${isWpcalcView ? ' grid-view-wpcalc-wrapper' : ''}`}>
      <FindReplaceDialog open={showFindReplace} onClose={() => setShowFindReplace(false)} />
      <div
        ref={containerRef}
        className={`cost-grid${isWpcalcView ? ' grid-view-wpcalc' : ''}`}
        tabIndex={0}
        onKeyDown={handleContainerKeyDown}
        onScroll={handleScroll}
        onWheel={handleWheel}
        onContextMenu={handleContextMenu}
        style={{ zoom: gridZoom / 100, display: showGrid ? undefined : 'none' }}
      >
        <GridHeader />
        <div style={{ height: totalHeight, position: 'relative', width: effectiveColumnWidths.reduce((s, w) => s + (w ?? 0), 0) }}>
          <div style={{ transform: `translateY(${offsetY}px)` }}>
            {visibleSlice.map((item, i) => {
              const rowIndex = startIndex + i;
              return (
                <GridRow
                  key={item.id}
                  item={item}
                  rowIndex={rowIndex}
                  activeRow={activeRow}
                  activeCol={activeCol}
                  isSelected={selectedRowSet.has(rowIndex)}
                  isChanged={changeTrackingSince ? isItemChangedSince(item, changeTrackingSince) : false}
                  changeMode={changeDisplayMode}
                  changedFields={changeTrackingSince && changeDisplayMode === 'cell'
                    ? [...changedFieldsSince(item, changeTrackingSince)].sort().join(',')
                    : undefined}
                  hideTotal={hideTotalSet.has(item.id)}
                  rowHeight={getRowHeight(rowIndex)}
                  columns={columns}
                  columnWidths={effectiveColumnWidths}
                  isChapterFooter={chapterFooterIds.has(item.id)}
                  resourceTotals={
                    chapterFooterIds.has(item.id)
                      ? resourceTotalsMap?.get(item.id.replace('footer:', ''))
                      : resourceTotalsMap?.get(item.id)
                  }
                  cellSelectionMinRow={cellSelBounds?.minRow}
                  cellSelectionMaxRow={cellSelBounds?.maxRow}
                  cellSelectionMinCol={cellSelBounds?.minCol}
                  cellSelectionMaxCol={cellSelBounds?.maxCol}
                  dropHintPosition={dropHint?.rowId === item.id ? dropHint.pos : null}
                  isDragging={draggingIds.has(item.id)}
                  onCellClick={handleCellClick}
                  onCellDoubleClick={handleCellDoubleClick}
                  onCellMouseDown={handleCellMouseDown}
                  onCellMouseEnter={handleCellMouseEnter}
                  onToggleCollapse={toggleCollapse}
                  onAddRow={handleAddRow}
                  onPointerDownRow={handleRowPointerDown}
                />
              );
            })}
          </div>
          {isEditing && visibleItems[activeRow] && (
            <GridCellEditor
              item={visibleItems[activeRow]}
              colIndex={activeCol}
              style={{
                position: 'absolute',
                top: rowOffsets[activeRow] ?? activeRow * ROW_HEIGHT,
                left: editorOffsetX,
                width: editorWidth,
                height: getRowHeight(activeRow),
                zIndex: 10,
              }}
              onCommit={commitEdit}
            />
          )}
        </div>
        {visibleItems.length > 0 && (() => {
          const kostprijs = getKostprijs(items);
          return (
            <div className="grid-total-row" style={{ height: ROW_HEIGHT, width: effectiveColumnWidths.reduce((s, w) => s + (w ?? 0), 0), minWidth: effectiveColumnWidths.reduce((s, w) => s + (w ?? 0), 0) }}>
              {columns.map((col, i) => (
                <div
                  key={col.key}
                  className="grid-total-cell"
                  style={{
                    width: effectiveColumnWidths[i],
                    textAlign: col.align as any,
                  }}
                >
                  {col.key === 'description' && t('totalExclVat')}
                  {col.key === 'total' && formatCurrency(kostprijs)}
                </div>
              ))}
            </div>
          );
        })()}
        {visibleItems.length === 0 && (
          <div className="grid-empty-state">
            {t("addRowHint")}
          </div>
        )}
        {contextMenu && (
          <GridContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            rowIndex={contextMenu.rowIndex}
            itemId={contextMenu.itemId}
            onClose={() => setContextMenu(null)}
            onExcelLink={(item) => { setContextMenu(null); setExcelPickerItem(item); }}
            onQuantityLink={(item) => { setContextMenu(null); setQuantityLinkItem(item); }}
          />
        )}
      </div>
      <ExcelCellPicker
        open={!!excelPickerItem}
        initialLink={excelPickerItem?.excelLink}
        onSelect={(link: ExcelLink, value: number | null) => {
          if (excelPickerItem) {
            pushHistory(items, 'Excel link');
            updateItem(excelPickerItem.id, 'excelLink', link);
            if (value !== null) {
              updateItem(excelPickerItem.id, 'quantity', value);
            }
          }
          setExcelPickerItem(null);
        }}
        onCancel={() => setExcelPickerItem(null)}
      />
      {quantityLinkItem && (
        <QuantityPicker
          onClose={() => setQuantityLinkItem(null)}
          onPick={(link, value) => {
            pushHistory(items, 'Hoeveelheid link');
            updateItem(quantityLinkItem.id, 'quantityLink', link);
            updateItem(quantityLinkItem.id, 'quantity', value);
            setQuantityLinkItem(null);
          }}
        />
      )}
      <CodePickerModal
        open={!!codePickerItem}
        onClose={() => setCodePickerItem(null)}
        onPick={(entry: CodeEntry) => {
          if (codePickerItem) {
            pushHistory(items, 'Codering kiezen');
            updateItem(codePickerItem.id, 'code', entry.code);
            // Lege omschrijving aanvullen met de standaard-omschrijving van de code.
            if (!codePickerItem.description.trim() && entry.description) {
              updateItem(codePickerItem.id, 'description', entry.description);
            }
          }
          setCodePickerItem(null);
        }}
      />
    </div>
  );
};
