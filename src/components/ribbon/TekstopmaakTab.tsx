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
    pas('Tekst uitlijnen', (it) => updateItem(it.id, 'textAlign', waarde));

  const stapGrootte = (delta: number) =>
    pas('Tekstgrootte', (it) => {
      const huidig = it.textSize ?? STANDAARD_SIZE;
      const nieuw = Math.max(MIN_SIZE, Math.min(MAX_SIZE, huidig + delta));
      updateItem(it.id, 'textSize', nieuw);
    });

  const wisOpmaak = () =>
    pas('Opmaak wissen', (it) => {
      updateItem(it.id, 'textBold', false);
      updateItem(it.id, 'textItalic', false);
      updateItem(it.id, 'textUnderline', false);
      updateItem(it.id, 'textAlign', 'left');
      updateItem(it.id, 'textSize', null);
    });

  return (
    <div className="ribbon-content">
      <div className="ribbon-groups">
        <RibbonGroup label="Tekststijl">
          <RibbonButton icon={textBoldIcon} label="Vet" title="Vet (hele regel)"
            size="small" disabled={uit} active={!!eerste?.textBold}
            onClick={() => toggle('textBold', 'Tekst vet')} />
          <RibbonButton icon={textItalicIcon} label="Cursief" title="Cursief (hele regel)"
            size="small" disabled={uit} active={!!eerste?.textItalic}
            onClick={() => toggle('textItalic', 'Tekst cursief')} />
          <RibbonButton icon={textUnderlineIcon} label="Onderstr." title="Onderstrepen (hele regel)"
            size="small" disabled={uit} active={!!eerste?.textUnderline}
            onClick={() => toggle('textUnderline', 'Tekst onderstrepen')} />
        </RibbonGroup>

        <RibbonGroup label="Grootte">
          <RibbonButton icon={textSizeUpIcon} label="Groter" title={`Groter (max ${MAX_SIZE} pt)`}
            size="small" disabled={uit} onClick={() => stapGrootte(1)} />
          <RibbonButton icon={textSizeDownIcon} label="Kleiner" title={`Kleiner (min ${MIN_SIZE} pt)`}
            size="small" disabled={uit} onClick={() => stapGrootte(-1)} />
        </RibbonGroup>

        <RibbonGroup label="Uitlijning">
          <RibbonButton icon={textAlignLeftIcon} label="Links" title="Links uitlijnen"
            size="small" disabled={uit} active={(eerste?.textAlign ?? 'left') === 'left'}
            onClick={() => zetUitlijning('left')} />
          <RibbonButton icon={textAlignCenterIcon} label="Midden" title="Centreren"
            size="small" disabled={uit} active={eerste?.textAlign === 'center'}
            onClick={() => zetUitlijning('center')} />
          <RibbonButton icon={textAlignRightIcon} label="Rechts" title="Rechts uitlijnen"
            size="small" disabled={uit} active={eerste?.textAlign === 'right'}
            onClick={() => zetUitlijning('right')} />
        </RibbonGroup>

        <RibbonGroup label="Herstellen">
          <RibbonButton icon={textClearIcon} label="Opmaak wissen" title="Terug naar de standaardopmaak"
            disabled={uit} onClick={wisOpmaak} />
        </RibbonGroup>

        <RibbonGroup label="Selectie">
          <div style={{ padding: '4px 8px', fontSize: 11, color: 'var(--theme-text-secondary)', maxWidth: 190 }}>
            {uit
              ? 'Zet de cursor op een tekst- of witregel om de opmaak te wijzigen.'
              : `${doelen.length} regel${doelen.length === 1 ? '' : 's'} geselecteerd.`}
          </div>
        </RibbonGroup>
      </div>
    </div>
  );
}
