import { useAppStore } from '@/state/appStore';
import type { BorderPreset } from '@/state/slices/subSheetSlice';

const PRESETS: { value: BorderPreset; label: string }[] = [
  { value: 'none',        label: 'Geen randen' },
  { value: 'all',         label: 'Alle randen' },
  { value: 'outer',       label: 'Buitenrand' },
  { value: 'thick-outer', label: 'Dikke buitenrand' },
  { value: 'inner',       label: 'Binnenranden' },
  { value: 'top',         label: 'Bovenrand' },
  { value: 'bottom',      label: 'Onderrand' },
];

interface Props {
  sheetId: string;
  cellRefs: string[];
  x: number;
  y: number;
  onClose: () => void;
}

export function SubSheetBorderPicker({ sheetId, cellRefs, x, y, onClose }: Props) {
  const apply = useAppStore((s) => s.setSubSheetSelectionBorders);
  return (
    <div
      className="subsheet-border-picker"
      style={{ left: x, top: y }}
      onMouseLeave={onClose}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="subsheet-border-picker-title">Randen</div>
      {PRESETS.map((p) => (
        <button
          key={p.value}
          onClick={() => {
            apply(sheetId, cellRefs, p.value);
            onClose();
          }}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
