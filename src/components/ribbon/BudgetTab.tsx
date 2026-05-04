import { useTranslation } from "react-i18next";
import RibbonButton from "./RibbonButton";
import RibbonGroup from "./RibbonGroup";
import RibbonButtonStack from "./RibbonButtonStack";
import {
  addChapterIcon, addBegrotingspostIcon, addBewakingspostIcon, addRegelIcon, addTekstregelIcon, deleteIcon,
  moveUpIcon, moveDownIcon, indentIcon, outdentIcon,
} from "./icons";
import { useAppStore } from "../../state/appStore";

export default function BudgetTab() {
  const { t } = useTranslation("ribbon");
  const { t: tCommon } = useTranslation("common");
  const {
    addItem, addChapter, addBewakingspost, addRegel, addTekstregel, deleteItem, moveItem,
    indentItem, outdentItem,
    activeRow, activeItemId,
    items, pushHistory,
  } = useAppStore();

  const activeItem = activeItemId ? items.find(i => i.id === activeItemId) : null;

  const handleAddChapter = () => {
    pushHistory(items, tCommon('newChapter'));
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
    let parentId = '';
    let afterId = activeItem.id;
    if (activeItem.rowType === 'begrotingspost') {
      parentId = activeItem.id;
      afterId = activeItem.id;
    } else {
      let current = activeItem;
      while (current) {
        const parent = items.find((i) => i.id === current.parentId);
        if (!parent) break;
        if (parent.rowType === 'begrotingspost') { parentId = parent.id; break; }
        current = parent;
      }
    }
    if (!parentId) return;
    pushHistory(items, tCommon('newMonitorPost'));
    addBewakingspost(parentId, afterId);
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

    let parentId = '';
    if (activeItem.rowType === 'bewakingspost' || activeItem.rowType === 'begrotingspost') {
      parentId = activeItem.id;
    } else if (activeItem.rowType === 'chapter') {
      // Find or create begrotingspost child
      const child = items.filter(i => i.parentId === activeItem.id && (i.rowType === 'begrotingspost' || i.rowType === 'bewakingspost')).pop();
      if (child) {
        parentId = child.id;
      } else {
        parentId = addItem(activeItem.id);
      }
    } else {
      parentId = activeItem.parentId ?? '';
    }
    if (!parentId) return;
    addRegel(parentId, activeItem.id);
  };

  const handleAddTekstregel = () => {
    if (!activeItem) return;
    let parentId = '';
    if (activeItem.rowType === 'bewakingspost') {
      parentId = activeItem.id;
    } else if (activeItem.rowType === 'regel' || activeItem.rowType === 'tekstregel') {
      parentId = activeItem.parentId ?? '';
    } else if (activeItem.rowType === 'begrotingspost') {
      const bwk = items.find((i) => i.parentId === activeItem.id && i.rowType === 'bewakingspost');
      if (bwk) parentId = bwk.id;
    }
    if (!parentId) return;
    pushHistory(items, tCommon('newTextLine'));
    addTekstregel(parentId, activeItem.id);
  };

  const handleDelete = () => {
    if (!activeItem) return;
    pushHistory(items, tCommon('delete'));
    deleteItem(activeItem.id);
  };

  return (
    <div className="ribbon-content">
      <div className="ribbon-groups">
        <RibbonGroup label={t("budget.rows")}>
          <RibbonButtonStack>
            <RibbonButton icon={addChapterIcon} label={t('home.chapter')} size="small" onClick={handleAddChapter} />
            <RibbonButton icon={addBegrotingspostIcon} label={t('home.budgetPost')} size="small" onClick={handleAddBegrotingspost} />
            <RibbonButton icon={addBewakingspostIcon} label={t('home.monitorPost')} size="small" onClick={handleAddBewakingspost} disabled={!activeItem} />
          </RibbonButtonStack>
          <RibbonButtonStack>
            <RibbonButton icon={addRegelIcon} label={t('home.calculationRule')} size="small" onClick={handleAddRegel} />
            <RibbonButton icon={addTekstregelIcon} label={t('home.textLine')} size="small" onClick={handleAddTekstregel} disabled={!activeItem} />
          </RibbonButtonStack>
          <RibbonButton icon={deleteIcon} label={t("budget.deleteRow")} onClick={handleDelete} disabled={!activeItem} />
        </RibbonGroup>

        <RibbonGroup label={t("budget.organize")}>
          <RibbonButtonStack>
            <RibbonButton icon={moveUpIcon} label={t("budget.moveUp")} size="small" onClick={() => activeItem && moveItem(activeItem.id, 'up')} disabled={!activeItem} />
            <RibbonButton icon={moveDownIcon} label={t("budget.moveDown")} size="small" onClick={() => activeItem && moveItem(activeItem.id, 'down')} disabled={!activeItem} />
          </RibbonButtonStack>
          <RibbonButtonStack>
            <RibbonButton icon={indentIcon} label={t("budget.indent")} size="small" onClick={() => activeItem && indentItem(activeItem.id)} disabled={!activeItem} />
            <RibbonButton icon={outdentIcon} label={t("budget.outdent")} size="small" onClick={() => activeItem && outdentItem(activeItem.id)} disabled={!activeItem} />
          </RibbonButtonStack>
        </RibbonGroup>
      </div>
    </div>
  );
}
