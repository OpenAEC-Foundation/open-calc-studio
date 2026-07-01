import { useState } from "react";
import { useTranslation } from "react-i18next";
import Modal from "../common/Modal";
import { ProjectInfoSettings } from "../report/ProjectInfoSettings";
import RibbonButton from "./RibbonButton";
import RibbonGroup from "./RibbonGroup";
import RibbonButtonStack from "./RibbonButtonStack";
import { clipboardIcon, cutIcon, copyIcon, undoIcon, redoIcon, addChapterIcon, addBegrotingspostIcon, addBewakingspostIcon, addRegelIcon, addTekstregelIcon, addWitregelIcon, deleteIcon, panelLeftIcon, panelRightIcon, settingsIcon, companyIcon, viewStIcon, viewWpCalcIcon, exportIcon, trackChangesIcon, clearMarksIcon, rowHighlightIcon, cellHighlightIcon, branchIcon, optionSetIcon } from "./icons";
import { useAppStore } from "../../state/appStore";
import { updateAllExcelLinks } from "../../services/excel/excelLinkService";

export default function HomeTab() {
  const { t } = useTranslation("ribbon");
  const { t: tCommon } = useTranslation("common");
  const {
    canUndo, canRedo, undo, redo, setItems,
    activeRow, activeItemId, getVisibleItems, copyItems, cutItems, pasteItems, clipboardItems,
    addItem, addChapter, addBewakingspost, addRegel, addTekstregel, addWitregel, deleteItem, items, pushHistory,
    toggleSchedulePanel, togglePropertiesPanel, toggleChatPanel, showSchedulePanel, showPropertiesPanel, showChatPanel,
    showHoeveelheid, toggleHoeveelheid,
    openDialog,
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

  const handleAddRegel = () => {
    pushHistory(items, tCommon('newCalculationRule'));

    // Empty budget or no active item: auto-create chapter + begrotingspost + regel
    if (!activeItem || items.length === 0) {
      const chapterId = addChapter(null);
      const postId = addItem(chapterId);
      addRegel(postId);
      return;
    }

    // Find the nearest bewakingspost or begrotingspost
    let parentId = '';
    if (activeItem.rowType === 'bewakingspost' || activeItem.rowType === 'begrotingspost') {
      parentId = activeItem.id;
    } else if (activeItem.rowType === 'chapter') {
      // On a chapter: find or create begrotingspost child
      const child = items.filter(i => i.parentId === activeItem.id && (i.rowType === 'begrotingspost' || i.rowType === 'bewakingspost')).pop();
      if (child) {
        parentId = child.id;
      } else {
        // No begrotingspost yet — create one
        parentId = addItem(activeItem.id);
      }
    } else {
      let current = activeItem;
      while (current) {
        if (current.rowType === 'bewakingspost' || current.rowType === 'begrotingspost') {
          parentId = current.id;
          break;
        }
        const parent = items.find((i) => i.id === current.parentId);
        if (!parent) break;
        current = parent;
      }
    }
    if (!parentId) return;
    addRegel(parentId, activeItem.id);
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
    pushHistory(items, 'Update Excel');
    const { updatedItems, updateCount, errors } = await updateAllExcelLinks(items);
    setItems(updatedItems);
    const msg = `${updateCount} hoeveelhe${updateCount === 1 ? 'id' : 'den'} bijgewerkt`;
    if (errors.length > 0) {
      alert(`${msg}\n\nWaarschuwingen:\n${errors.join('\n')}`);
    } else if (updateCount > 0) {
      alert(msg);
    } else {
      alert('Alle waarden zijn al up-to-date');
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
        </RibbonGroup>

        <RibbonGroup label="Wijzigingen">
          <RibbonButton
            icon={trackChangesIcon}
            label="Bijhouden"
            title={trackingOn
              ? "Wijzigingen bijhouden staat aan — gewijzigde regels krijgen een kleur. Klik om uit te zetten."
              : "Wijzigingen bijhouden aanzetten — vanaf nu krijgen gewijzigde regels een kleur"}
            active={trackingOn}
            onClick={toggleChangeTracking}
          />
          <RibbonButton
            icon={clearMarksIcon}
            label="Wis markeringen"
            size="small"
            title="Wis de huidige kleurmarkeringen, maar blijf wijzigingen bijhouden"
            disabled={!trackingOn}
            onClick={clearChangeMarks}
          />
          <RibbonButtonStack>
            <RibbonButton
              icon={rowHighlightIcon}
              label="Hele regel"
              size="small"
              title="Markeer de hele gewijzigde regel"
              active={changeDisplayMode === 'row'}
              onClick={() => setChangeDisplayMode('row')}
            />
            <RibbonButton
              icon={cellHighlightIcon}
              label="Alleen cel"
              size="small"
              title="Markeer alleen de gewijzigde cel(len)"
              active={changeDisplayMode === 'cell'}
              onClick={() => setChangeDisplayMode('cell')}
            />
          </RibbonButtonStack>
        </RibbonGroup>

        <RibbonGroup label="Project">
          <RibbonButton
            icon={companyIcon}
            label="Projectgegevens"
            title="Projectnaam/-nummer, opdrachtgever, rapportdatum en kengetallen instellen"
            onClick={() => setShowProject(true)}
          />
        </RibbonGroup>

        <RibbonGroup label="Varianten">
          <RibbonButton
            icon={branchIcon}
            label="Varianten"
            title={branchesOn ? "Begrotingsvarianten staan aan. Klik om uit te zetten." : "Begrotingsvarianten inschakelen (varianten/opties per regel)"}
            active={branchesOn}
            onClick={toggleBranchesEnabled}
          />
          <RibbonButton
            icon={optionSetIcon}
            label="Optieset"
            title="Maak een optieset (variant-groep) met twee opties aan"
            onClick={handleCreateOptieSet}
          />
        </RibbonGroup>

        {hasExcelLinks && (
          <RibbonGroup label="Excel">
            <RibbonButton icon={exportIcon} label="Update Excel" onClick={handleUpdateExcel} />
          </RibbonGroup>
        )}

      </div>

      <Modal open={showProject} onClose={() => setShowProject(false)} title="Projectgegevens">
        <ProjectInfoSettings />
      </Modal>
    </div>
  );
}
