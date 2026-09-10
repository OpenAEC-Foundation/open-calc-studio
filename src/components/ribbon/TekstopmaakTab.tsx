import { useTranslation } from "react-i18next";
import { useAppStore } from "@/state/appStore";
import { isFooterRow } from "@/services/grid/gridRows";
import RibbonGroup from "./RibbonGroup";
import RibbonButton from "./RibbonButton";
import {
  textBoldIcon,
  textItalicIcon,
  textUnderlineIcon,
  textAlignLeftIcon,
  textAlignCenterIcon,
  textAlignRightIcon,
  textSizeUpIcon,
  textSizeDownIcon,
  textClearIcon,
} from "./icons";
import type { CostItem } from "@/types/costModel";

/** Alleen tekst- en witregels dragen opmaak; op rekenregels heeft het geen zin. */
export function isOpmaakbareRegel(item?: CostItem): boolean {
  return !!item && (item.rowType === 'tekstregel' || item.rowType === 'witregel');
}

const MIN_SIZE = 7;
const MAX_SIZE = 24;
const STANDAARD_SIZE = 11;

export default function TekstopmaakTab() {
  const { t } = useTranslation("ribbon");
  const items = useAppStore((s) => s.items);
  const activeItemId = useAppStore((s) => s.activeItemId);
  const activeRow = useAppStore((s) => s.activeRow);
  const getGridRows = useAppStore((s) => s.getGridRows);
  const getSelectedRowIndices = useAppStore((s) => s.getSelectedRowIndices);
  const updateItem = useAppStore((s) => s.updateItem);
  const pushHistory = useAppStore((s) => s.pushHistory);

  // Alle geselecteerde tekstregels, zodat je in één keer een blok opmaakt.
  const doelen: CostItem[] = (() => {
    const rows = getGridRows();
    const indices = getSelectedRowIndices();
    const uitSelectie = indices
      .map((i) => rows[i])
      .filter((r): r is CostItem => !!r && !isFooterRow(r.id))
      .filter(isOpmaakbareRegel);
    if (uitSelectie.length > 0) return uitSelectie;
    const actief = activeItemId
      ? items.find((i) => i.id === activeItemId)
      : rows[activeRow];
    return isOpmaakbareRegel(actief) ? [actief!] : [];
  })();

  const eerste = doelen[0];
  const uit = doelen.length === 0;

  const pas = (label: string, fn: (item: CostItem) => void) => {
    if (uit) return;
    pushHistory(items, label);
    for (const it of doelen) fn(it);
  };

  const toggle = (veld: 'textBold' | 'textItalic' | 'textUnderline', label: string) => {
    const nieuw = !eerste?.[veld];
    pas(label, (it) => updateItem(it.id, veld, nieuw));
  };

  const zetUitlijning = (waarde: 'left' | 'center' | 'right') =>
    pas(t('tekstopmaak.histAlign'), (it) => updateItem(it.id, 'textAlign', waarde));

  const stapGrootte = (delta: number) =>
    pas(t('tekstopmaak.histSize'), (it) => {
      const huidig = it.textSize ?? STANDAARD_SIZE;
      const nieuw = Math.max(MIN_SIZE, Math.min(MAX_SIZE, huidig + delta));
      updateItem(it.id, 'textSize', nieuw);
    });

  const wisOpmaak = () =>
    pas(t('tekstopmaak.clearFormat'), (it) => {
      updateItem(it.id, 'textBold', false);
      updateItem(it.id, 'textItalic', false);
      updateItem(it.id, 'textUnderline', false);
      updateItem(it.id, 'textAlign', 'left');
      updateItem(it.id, 'textSize', null);
    });

  return (
    <div className="ribbon-content">
      <div className="ribbon-groups">
        <RibbonGroup label={t('tekstopmaak.textStyle')}>
          <RibbonButton icon={textBoldIcon} label={t('tekstopmaak.bold')} title={t('tekstopmaak.boldTitle')}
            size="small" disabled={uit} active={!!eerste?.textBold}
            onClick={() => toggle('textBold', t('tekstopmaak.histBold'))} />
          <RibbonButton icon={textItalicIcon} label={t('tekstopmaak.italic')} title={t('tekstopmaak.italicTitle')}
            size="small" disabled={uit} active={!!eerste?.textItalic}
            onClick={() => toggle('textItalic', t('tekstopmaak.histItalic'))} />
          <RibbonButton icon={textUnderlineIcon} label={t('tekstopmaak.underline')} title={t('tekstopmaak.underlineTitle')}
            size="small" disabled={uit} active={!!eerste?.textUnderline}
            onClick={() => toggle('textUnderline', t('tekstopmaak.histUnderline'))} />
        </RibbonGroup>

        <RibbonGroup label={t('tekstopmaak.size')}>
          <RibbonButton icon={textSizeUpIcon} label={t('tekstopmaak.larger')} title={t('tekstopmaak.largerTitle', { max: MAX_SIZE })}
            size="small" disabled={uit} onClick={() => stapGrootte(1)} />
          <RibbonButton icon={textSizeDownIcon} label={t('tekstopmaak.smaller')} title={t('tekstopmaak.smallerTitle', { min: MIN_SIZE })}
            size="small" disabled={uit} onClick={() => stapGrootte(-1)} />
        </RibbonGroup>

        <RibbonGroup label={t('tekstopmaak.alignment')}>
          <RibbonButton icon={textAlignLeftIcon} label={t('tekstopmaak.alignLeft')} title={t('tekstopmaak.alignLeftTitle')}
            size="small" disabled={uit} active={(eerste?.textAlign ?? 'left') === 'left'}
            onClick={() => zetUitlijning('left')} />
          <RibbonButton icon={textAlignCenterIcon} label={t('tekstopmaak.alignCenter')} title={t('tekstopmaak.alignCenterTitle')}
            size="small" disabled={uit} active={eerste?.textAlign === 'center'}
            onClick={() => zetUitlijning('center')} />
          <RibbonButton icon={textAlignRightIcon} label={t('tekstopmaak.alignRight')} title={t('tekstopmaak.alignRightTitle')}
            size="small" disabled={uit} active={eerste?.textAlign === 'right'}
            onClick={() => zetUitlijning('right')} />
        </RibbonGroup>

        <RibbonGroup label={t('tekstopmaak.restore')}>
          <RibbonButton icon={textClearIcon} label={t('tekstopmaak.clearFormat')} title={t('tekstopmaak.clearFormatTitle')}
            disabled={uit} onClick={wisOpmaak} />
        </RibbonGroup>

        <RibbonGroup label={t('tekstopmaak.selection')}>
          <div style={{ padding: '4px 8px', fontSize: 11, color: 'var(--theme-text-secondary)', maxWidth: 190 }}>
            {uit
              ? t('tekstopmaak.statusEmpty')
              : t('tekstopmaak.statusSelected', { count: doelen.length })}
          </div>
        </RibbonGroup>
      </div>
    </div>
  );
}
