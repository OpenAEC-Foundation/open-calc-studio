import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/state/appStore';
import type { BorderPreset } from '@/state/slices/subSheetSlice';

const PRESETS: { value: BorderPreset; labelKey: string }[] = [
  { value: 'none',        labelKey: 'subsheet.borderNone' },
  { value: 'all',         labelKey: 'subsheet.borderAll' },
  { value: 'outer',       labelKey: 'subsheet.borderOuter' },
  { value: 'thick-outer', labelKey: 'subsheet.borderThickOuter' },
  { value: 'inner',       labelKey: 'subsheet.borderInner' },
  { value: 'top',         labelKey: 'subsheet.borderTop' },
  { value: 'bottom',      labelKey: 'subsheet.borderBottom' },
];

interface Props {
  sheetId: string;
  cellRefs: string[];
  x: number;
  y: number;
  onClose: () => void;
}

export function SubSheetBorderPicker({ sheetId, cellRefs, x, y, onClose }: Props) {
  const { t } = useTranslation('grid');
  const apply = useAppStore((s) => s.setSubSheetSelectionBorders);
  return (
    <div
      className="subsheet-border-picker"
      style={{ left: x, top: y }}
      onMouseLeave={onClose}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="subsheet-border-picker-title">{t('subsheet.borders')}</div>
      {PRESETS.map((p) => (
        <button
          key={p.value}
          onClick={() => {
            apply(sheetId, cellRefs, p.value);
            onClose();
          }}
        >
          {t(p.labelKey)}
        </button>
      ))}
    </div>
  );
}
