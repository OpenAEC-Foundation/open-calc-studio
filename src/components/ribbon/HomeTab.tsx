import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import Modal from "../common/Modal";
import { ProjectInfoSettings } from "../report/ProjectInfoSettings";
import RibbonButton from "./RibbonButton";
import RibbonGroup from "./RibbonGroup";
import RibbonButtonStack from "./RibbonButtonStack";
import { clipboardIcon, cutIcon, copyIcon, undoIcon, redoIcon, addChapterIcon, addBegrotingspostIcon, addBewakingspostIcon, addRegelIcon, addTekstregelIcon, addWitregelIcon, deleteIcon, settingsIcon, companyIcon, viewStIcon, viewWpCalcIcon, exportIcon, trackChangesIcon, clearMarksIcon, rowHighlightIcon, cellHighlightIcon, branchIcon, optionSetIcon } from "./icons";
import { useAppStore } from "../../state/appStore";
import { updateAllExcelLinks } from "../../services/excel/excelLinkService";

export default function HomeTab() {
  const { t } = useTranslation("ribbon");
  const { t: tCommon } = useTranslation("common");
  const {
    canUndo, canRedo, undo, redo, setItems, undoStack,
    activeRow, activeItemId, copyItems, cutItems, pasteItems, clipboardItems,
    addItem, addChapter, addBewakingspost, addTekstregel, addWitregel, insertRegelBelow, deleteItem, items, pushHistory,
    collapseToLevel, scaleAllPrices,
    showHoeveelheid, toggleHoeveelheid,
    gridView, setGridView,
    schedule, toggleChangeTracking, clearChangeMarks, setChangeDisplayMode,
    toggleBranchesEnabled,
  } = useAppStore();

  const trackingOn = !!schedule.changeTrackingSince;
  const changeDisplayMode = schedule.changeDisplayMode ?? 'row';
  const branchesOn = !!schedule.branchesEnabled;
  const [showProject, setShowProject] = useState(false);

  // Maak in één klik een optieset (variant-groep) met twee opties aan.
  const handleCreateOptieSet = () => {
    const st = useAppStore.getState();
    if (!st.schedule.branchesEnabled) st.toggleBranchesEnabled(); // schakelt in + maakt 'main'
    const branches = useAppStore.getState().schedule.branches ?? [];
    const n = branches.filter(b => b.parentId === 'main').length + 1;
    const setId = st.addBranch(`Optieset ${n}`, 'main');
    st.addBranch('Optie A', setId);
    st.addBranch('Optie B', setId);
  };

  const handleUndo = () => {
    const restored = undo();
    if (restored) setItems(restored);
  };

  const handleRedo = () => {
    const restored = redo();
    if (restored) setItems(restored);
  };

  // Inklappen-tot-niveau dropdown + prijzen-schalen dialoog
  // Dropdowns renderen via een portal naar body: het lint heeft
  // overflow:hidden en transform-animaties, waardoor ze anders achter
  // het grid wegvallen (zelfde kwaal als eerder de dialogen).
  const [showCollapseList, setShowCollapseList] = useState(false);
  const [collapsePos, setCollapsePos] = useState<{ top: number; left: number } | null>(null);
  const collapseWrapRef = useRef<HTMLDivElement>(null);
  const [showPriceDialog, setShowPriceDialog] = useState(false);
  const [pricePct, setPricePct] = useState('10');

  const posBelow = (el: HTMLElement | null) => {
    if (!el) return { top: 130, left: 200 };
    const r = el.getBoundingClientRect();
    return { top: r.bottom + 2, left: Math.max(4, Math.min(r.left, window.innerWidth - 250)) };
  };

  const handleScalePrices = () => {
    const pct = parseFloat(pricePct.replace(',', '.'));
    if (!Number.isFinite(pct) || pct === 0 || pct <= -100) return;
    pushHistory(items, t('home.pricesHistory', { pct: `${pct > 0 ? '+' : ''}${pct}` }));
    scaleAllPrices(1 + pct / 100);
    setShowPriceDialog(false);
  };

  useEffect(() => {
    if (!showCollapseList) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.ribbon-undo-dropdown-wrap, .ribbon-undo-dropdown')) setShowCollapseList(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [showCollapseList]);

  // Meerstaps ongedaan maken via het dropdowntje naast de Ongedaan-knop:
  // n keer poppen en de laatst herstelde staat toepassen (elke stap apart
  // toepassen houdt de redo-stack correct).
  const [showUndoList, setShowUndoList] = useState(false);
  const [undoPos, setUndoPos] = useState<{ top: number; left: number } | null>(null);
  const handleUndoSteps = (n: number) => {
    for (let i = 0; i < n; i++) {
      const restored = undo();
      if (!restored) break;
      setItems(restored);
    }
    setShowUndoList(false);
  };

  useEffect(() => {
    if (!showUndoList) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.ribbon-undo-dropdown-wrap, .ribbon-undo-dropdown')) setShowUndoList(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [showUndoList]);

  const activeItem = activeItemId ? items.find(i => i.id === activeItemId) : null;

  const handleAddChapter = () => {
    pushHistory(items, tCommon('newChapter'));
    // Add as sibling of active chapter, or at root after current item
    const parentId = activeItem?.rowType === 'chapter' ? activeItem.parentId : (activeItem?.parentId ?? null);
    addChapter(parentId, activeItem?.id);
  };

  const handleAddBegrotingspost = () => {
    pushHistory(items, tCommon('newBudgetPost'));
    const parentId = activeItem?.rowType === 'chapter' ? activeItem.id : (activeItem?.parentId ?? null);
    addItem(parentId, activeRow);
  };

  const handleAddBewakingspost = () => {
    if (!activeItem) return;
    // Find the nearest begrotingspost: either the active item itself, or walk up
    let parentId = '';
    if (activeItem.rowType === 'begrotingspost') {
      parentId = activeItem.id;
    } else {
      let current = activeItem;
      while (current) {
        if (current.rowType === 'begrotingspost') { parentId = current.id; break; }
        const parent = items.find((i) => i.id === current.parentId);
        if (!parent) break;
        current = parent;
      }
    }
    if (!parentId) return;
    pushHistory(items, tCommon('newMonitorPost'));
    addBewakingspost(parentId, activeItem.id);
  };

  // Gedeelde actie met de +-knop bij de rij (insertRegelBelow in de store):
  // voegt een rekenregel toe direct onder het actieve item.
  const handleAddRegel = () => {
    pushHistory(items, tCommon('newCalculationRule'));
    insertRegelBelow(activeItemId ?? null);
  };

  const handleAddTekstregel = () => {
    if (!activeItem) return;
    // Tekstregel can go under bewakingspost, begrotingspost, or chapter
    let parentId = '';
    if (activeItem.rowType === 'bewakingspost' || activeItem.rowType === 'begrotingspost' || activeItem.rowType === 'chapter') {
      parentId = activeItem.id;
    } else {
      // Walk up to find nearest container
      let current = activeItem;
      while (current) {
        if (current.rowType === 'bewakingspost' || current.rowType === 'begrotingspost' || current.rowType === 'chapter') {
          parentId = current.id;
          break;
        }
        const parent = items.find((i) => i.id === current.parentId);
        if (!parent) break;
        current = parent;
      }
    }
    if (!parentId) return;
    pushHistory(items, tCommon('newTextLine'));
    addTekstregel(parentId, activeItem.id);
  };

  const handleAddWitregel = () => {
    if (!activeItem) return;
    // Witregel can go anywhere in the hierarchy
    const parentId = activeItem.parentId;
    pushHistory(items, tCommon('newBlankLine'));
    addWitregel(parentId, activeItem.id);
  };

  const handleDelete = () => {
    if (!activeItem) return;
    pushHistory(items, tCommon('delete'));
    deleteItem(activeItem.id);
  };

  const hasExcelLinks = items.some(i => !!i.excelLink);

  const handleUpdateExcel = async () => {
    pushHistory(items, t('home.updateExcel'));
    const { updatedItems, updateCount, errors } = await updateAllExcelLinks(items);
    setItems(updatedItems);
    const msg = t('home.excelUpdated', { count: updateCount });
    if (errors.length > 0) {
      alert(`${msg}\n\n${t('home.excelWarnings')}\n${errors.join('\n')}`);
    } else if (updateCount > 0) {
      alert(msg);
    } else {
      alert(t('home.excelUpToDate'));
    }
  };

  return (
    <div className="ribbon-content">
      <div className="ribbon-groups">
        <RibbonGroup label={t("home.rows")}>
          <RibbonButtonStack>
            <RibbonButton icon={addChapterIcon} label={t('home.chapter')} size="small" onClick={handleAddChapter} />
            <RibbonButton icon={addBegrotingspostIcon} label={t('home.budgetPost')} size="small" onClick={handleAddBegrotingspost} />
            <RibbonButton icon={addBewakingspostIcon} label={t('home.monitorPost')} size="small" onClick={handleAddBewakingspost} disabled={!activeItem} />
          </RibbonButtonStack>
          <RibbonButtonStack>
            <RibbonButton icon={addRegelIcon} label={t('home.calculationRule')} size="small" onClick={handleAddRegel} />
            <RibbonButton icon={addTekstregelIcon} label={t('home.textLine')} size="small" onClick={handleAddTekstregel} disabled={!activeItem} />
            <RibbonButton icon={addWitregelIcon} label={t('home.blankLine')} size="small" onClick={handleAddWitregel} disabled={!activeItem} />
          </RibbonButtonStack>
          <RibbonButton
            icon={addRegelIcon}
            label={t('home.addRegelDirect')}
            title={t('home.addRegelDirectTitle')}
            onClick={handleAddRegel}
          />
          <RibbonButton icon={deleteIcon} label={t("budget.deleteRow")} onClick={handleDelete} disabled={!activeItem} />
        </RibbonGroup>

        <RibbonGroup label={t("home.clipboard")}>
          <RibbonButton icon={clipboardIcon} label={t("home.paste")} onClick={() => pasteItems()} disabled={clipboardItems.length === 0} />
          <RibbonButtonStack>
            <RibbonButton icon={cutIcon} label={t("home.cut")} size="small" onClick={() => activeItem && cutItems([activeItem])} />
            <RibbonButton icon={copyIcon} label={t("home.copy")} size="small" onClick={() => activeItem && copyItems([activeItem])} />
          </RibbonButtonStack>
        </RibbonGroup>

        <RibbonGroup label={t("home.history")}>
          <RibbonButton icon={undoIcon} label={t("home.undo")} onClick={handleUndo} disabled={!canUndo()} />
          <div className="ribbon-undo-dropdown-wrap">
            <button
              className="ribbon-undo-dropdown-toggle"
              title={t('home.undoMultipleTitle')}
              disabled={!canUndo()}
              onClick={(e) => { setUndoPos(posBelow(e.currentTarget as HTMLElement)); setShowUndoList((v) => !v); }}
            >▾</button>
            {showUndoList && undoPos && createPortal(
              <div className="ribbon-undo-dropdown" style={{ position: 'fixed', top: undoPos.top, left: undoPos.left }}>
                <div className="ribbon-undo-dropdown-header">{t('home.undoUpTo')}</div>
                {[...undoStack].reverse().slice(0, 15).map((entry, i) => (
                  <button
                    key={`${undoStack.length - i}-${entry.description}`}
                    className="ribbon-undo-dropdown-item"
                    onClick={() => handleUndoSteps(i + 1)}
                  >
                    <span className="ribbon-undo-step">{i + 1}</span>
                    {entry.description || t('home.changeFallback')}
                  </button>
                ))}
              </div>,
              document.body
            )}
          </div>
          <RibbonButton icon={redoIcon} label={t("home.redo")} onClick={handleRedo} disabled={!canRedo()} />
        </RibbonGroup>

        <RibbonGroup label={t("view.panels")}>
          <RibbonButton
            icon={settingsIcon}
            label={t('home.quantity')}
            onClick={toggleHoeveelheid}
            active={showHoeveelheid}
          />
        </RibbonGroup>

        <RibbonGroup label={t('home.display')}>
          <RibbonButton
            icon={viewStIcon}
            label={t('home.viewUi1')}
            size="small"
            onClick={() => setGridView('st')}
            active={gridView === 'st'}
          />
          <RibbonButton
            icon={viewWpCalcIcon}
            label={t('home.viewUi2')}
            size="small"
            onClick={() => setGridView('wpcalc')}
            active={gridView === 'wpcalc'}
          />
          <RibbonButton
            icon={viewStIcon}
            label={t('home.viewUi3', 'UI-3')}
            size="small"
            onClick={() => setGridView('simple')}
            active={gridView === 'simple'}
          />
          <div className="ribbon-undo-dropdown-wrap" ref={collapseWrapRef}>
            <RibbonButton
              icon={addBewakingspostIcon}
              label={t('home.collapse')}
              title={t('home.collapseTitle')}
              onClick={() => { setCollapsePos(posBelow(collapseWrapRef.current)); setShowCollapseList((v) => !v); }}
            />
            {showCollapseList && collapsePos && createPortal(
              <div className="ribbon-undo-dropdown" style={{ position: 'fixed', top: collapsePos.top, left: collapsePos.left }}>
                <div className="ribbon-undo-dropdown-header">{t('home.collapseTo')}</div>
                {([
                  ['hoofdstuk', t('home.collapseChapters')],
                  ['paragraaf', t('home.collapseParagraphs')],
                  ['begrotingspost', t('home.collapseBudgetPosts')],
                  ['bewakingspost', t('home.collapseMonitorPosts')],
                  ['alles', t('home.expandAll')],
                ] as const).map(([niveau, label]) => (
                  <button
                    key={niveau}
                    className="ribbon-undo-dropdown-item"
                    onClick={() => { collapseToLevel(niveau); setShowCollapseList(false); }}
                  >
                    {label}
                  </button>
                ))}
              </div>,
              document.body
            )}
          </div>
        </RibbonGroup>

        <RibbonGroup label={t('home.pricesGroup')}>
          <RibbonButton
            icon={settingsIcon}
            label={t('home.pricesPct')}
            title={t('home.pricesPctTitle')}
            onClick={() => { setPricePct('10'); setShowPriceDialog(true); }}
          />
        </RibbonGroup>

        <RibbonGroup label={t('home.changesGroup')}>
          <RibbonButton
            icon={trackChangesIcon}
            label={t('home.trackChanges')}
            title={trackingOn
              ? t('home.trackChangesOnTitle')
              : t('home.trackChangesOffTitle')}
            active={trackingOn}
            onClick={toggleChangeTracking}
          />
          <RibbonButton
            icon={clearMarksIcon}
            label={t('home.clearMarks')}
            size="small"
            title={t('home.clearMarksTitle')}
            disabled={!trackingOn}
            onClick={clearChangeMarks}
          />
          <RibbonButtonStack>
            <RibbonButton
              icon={rowHighlightIcon}
              label={t('home.wholeRow')}
              size="small"
              title={t('home.wholeRowTitle')}
              active={changeDisplayMode === 'row'}
              onClick={() => setChangeDisplayMode('row')}
            />
            <RibbonButton
              icon={cellHighlightIcon}
              label={t('home.cellOnly')}
              size="small"
              title={t('home.cellOnlyTitle')}
              active={changeDisplayMode === 'cell'}
              onClick={() => setChangeDisplayMode('cell')}
            />
          </RibbonButtonStack>
        </RibbonGroup>

        <RibbonGroup label={t('home.projectGroup')}>
          <RibbonButton
            icon={companyIcon}
            label={t('home.projectData')}
            title={t('home.projectDataTitle')}
            onClick={() => setShowProject(true)}
          />
        </RibbonGroup>

        <RibbonGroup label={t('home.variantsGroup')}>
          <RibbonButton
            icon={branchIcon}
            label={t('home.variants')}
            title={branchesOn ? t('home.variantsOnTitle') : t('home.variantsOffTitle')}
            active={branchesOn}
            onClick={toggleBranchesEnabled}
          />
          <RibbonButton
            icon={optionSetIcon}
            label={t('home.optionSet')}
            title={t('home.optionSetTitle')}
            onClick={handleCreateOptieSet}
          />
        </RibbonGroup>

        {hasExcelLinks && (
          <RibbonGroup label={t('home.excelGroup')}>
            <RibbonButton icon={exportIcon} label={t('home.updateExcel')} onClick={handleUpdateExcel} />
          </RibbonGroup>
        )}

      </div>

      <Modal open={showProject} onClose={() => setShowProject(false)} title={t('home.projectData')}>
        <ProjectInfoSettings />
      </Modal>

      <Modal open={showPriceDialog} onClose={() => setShowPriceDialog(false)} title={t('home.priceDialogTitle')} className="rapport-props-dialog">
        <div className="rapport-props">
          <label className="rapport-props-row">
            <span>
              <strong>{t('home.percentage')}</strong>
              <em>{t('home.percentageHelp')}</em>
            </span>
          </label>
          <div className="price-scale-row">
            <input
              type="number"
              step="0.1"
              value={pricePct}
              autoFocus
              onChange={(e) => setPricePct(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleScalePrices(); }}
              className="price-scale-input"
            />
            <span className="price-scale-pct">%</span>
            <button className="cmd-btn cmd-btn-primary" onClick={handleScalePrices}>{t('home.apply')}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
