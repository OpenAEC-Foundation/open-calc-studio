import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/state/appStore';

const ROW_COLOR_PRESETS: { nameKey: string; value: string | null }[] = [
  { nameKey: 'subsheet.colorNone', value: null },
  { nameKey: 'subsheet.colorAmber', value: '#fff3e0' },
  { nameKey: 'subsheet.colorYellow', value: '#fff9c4' },
  { nameKey: 'subsheet.colorGreen', value: '#e8f5e9' },
  { nameKey: 'subsheet.colorBlue', value: '#e3f2fd' },
  { nameKey: 'subsheet.colorPurple', value: '#f3e5f5' },
  { nameKey: 'subsheet.colorPink', value: '#fce4ec' },
  { nameKey: 'subsheet.colorRed', value: '#ffebee' },
  { nameKey: 'subsheet.colorGray', value: '#eceff1' },
];

interface Props {
  sheetId: string;
  rowIndex: number;
  x: number;
  y: number;
  onClose: () => void;
}

export function SubSheetRowContextMenu({ sheetId, rowIndex, x, y, onClose }: Props) {
  const { t } = useTranslation('grid');
  const setRowColor = useAppStore((s) => s.setSubSheetRowColor);
  return (
    <div
      className="subsheet-row-menu"
      style={{ left: x, top: y }}
      onMouseLeave={onClose}
    >
      <div className="subsheet-row-menu-title">{t('subsheet.rowColor')}</div>
      {ROW_COLOR_PRESETS.map((c) => (
        <button
          key={c.nameKey}
          onClick={() => {
            setRowColor(sheetId, rowIndex, c.value);
            onClose();
          }}
        >
          <span
            className="swatch"
            style={{
              background: c.value ?? 'transparent',
              border: '1px solid var(--theme-border, #ccc)',
            }}
          />
          {t(c.nameKey)}
        </button>
      ))}
    </div>
  );
}
