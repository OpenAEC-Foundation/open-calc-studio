import { useAppStore } from '@/state/appStore';

const ROW_COLOR_PRESETS: { name: string; value: string | null }[] = [
  { name: 'Geen', value: null },
  { name: 'Amber', value: '#fff3e0' },
  { name: 'Geel', value: '#fff9c4' },
  { name: 'Groen', value: '#e8f5e9' },
  { name: 'Blauw', value: '#e3f2fd' },
  { name: 'Paars', value: '#f3e5f5' },
  { name: 'Roze', value: '#fce4ec' },
  { name: 'Rood', value: '#ffebee' },
  { name: 'Grijs', value: '#eceff1' },
];

interface Props {
  sheetId: string;
  rowIndex: number;
  x: number;
  y: number;
  onClose: () => void;
}

export function SubSheetRowContextMenu({ sheetId, rowIndex, x, y, onClose }: Props) {
  const setRowColor = useAppStore((s) => s.setSubSheetRowColor);
  return (
    <div
      className="subsheet-row-menu"
      style={{ left: x, top: y }}
      onMouseLeave={onClose}
    >
      <div className="subsheet-row-menu-title">Rijkleur</div>
      {ROW_COLOR_PRESETS.map((c) => (
        <button
          key={c.name}
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
          {c.name}
        </button>
      ))}
    </div>
  );
}
