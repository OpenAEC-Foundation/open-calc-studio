import RibbonButton from "./RibbonButton";
import RibbonGroup from "./RibbonGroup";
import RibbonButtonStack from "./RibbonButtonStack";
import { useAppStore } from "../../state/appStore";

export default function SpreadsheetTab() {
  const {
    subSheets, addSubSheet, removeSubSheet, activeSubSheetId, setActiveSubSheet,
    toggleSubSheetCellBold, toggleSubSheetCellItalic,
    setSubSheetCellAlign, setSubSheetCellFormat, setSubSheetCellDecimals, setSubSheetCellFontSize,
  } = useAppStore();

  const activeSheet = subSheets.find(s => s.id === activeSubSheetId);

  // Get active cell ref from the SubSheetEditor (stored in DOM via data attribute)
  const getActiveCellRef = (): string | null => {
    const el = document.querySelector('.subsheet-cell.active');
    if (!el) return null;
    // Parse from the cell's position
    return el.closest('[data-cell-ref]')?.getAttribute('data-cell-ref') || null;
  };

  // Apply action to active cell (or all selected)
  const applyToSelection = (fn: (ref: string) => void) => {
    if (!activeSubSheetId || !activeSheet) return;
    // Try to get selected cells from the editor's state via a global event
    const event = new CustomEvent('spreadsheet-get-selection');
    document.dispatchEvent(event);
    // Fallback: use the active cell from store
    const ref = getActiveCellRef();
    if (ref) fn(ref);
  };

  const btnStyle = { fontSize: 12, padding: '2px 8px', border: '1px solid var(--theme-border)', borderRadius: 3, background: 'var(--theme-surface)', color: 'var(--theme-text)', cursor: 'pointer', minWidth: 28, height: 24 };

  return (
    <div className="ribbon-content">
      <div className="ribbon-groups">
        <RibbonGroup label="Werkbladen">
          <RibbonButton icon="➕" label="Nieuw blad" onClick={() => addSubSheet()} />
          <RibbonButton icon="🗑️" label="Verwijder" onClick={() => activeSubSheetId && removeSubSheet(activeSubSheetId)} disabled={!activeSubSheetId} />
          {subSheets.length > 0 && (
            <select
              style={{ ...btnStyle, width: 100 }}
              value={activeSubSheetId || ''}
              onChange={(e) => setActiveSubSheet(e.target.value || null)}
            >
              {subSheets.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
        </RibbonGroup>

        <RibbonGroup label="Opmaak">
          <RibbonButtonStack>
            <RibbonButton icon="𝐁" label="Vet" size="small" onClick={() => {
              // Dispatch event to SubSheetEditor to toggle bold on selection
              document.dispatchEvent(new CustomEvent('spreadsheet-action', { detail: 'bold' }));
            }} />
            <RibbonButton icon="𝐼" label="Cursief" size="small" onClick={() => {
              document.dispatchEvent(new CustomEvent('spreadsheet-action', { detail: 'italic' }));
            }} />
          </RibbonButtonStack>
          <RibbonButtonStack>
            <RibbonButton icon="⬅" label="Links" size="small" onClick={() => {
              document.dispatchEvent(new CustomEvent('spreadsheet-action', { detail: 'align-left' }));
            }} />
            <RibbonButton icon="⬌" label="Midden" size="small" onClick={() => {
              document.dispatchEvent(new CustomEvent('spreadsheet-action', { detail: 'align-center' }));
            }} />
            <RibbonButton icon="➡" label="Rechts" size="small" onClick={() => {
              document.dispatchEvent(new CustomEvent('spreadsheet-action', { detail: 'align-right' }));
            }} />
          </RibbonButtonStack>
        </RibbonGroup>

        <RibbonGroup label="Getal">
          <select
            style={btnStyle}
            defaultValue="auto"
            onChange={(e) => {
              document.dispatchEvent(new CustomEvent('spreadsheet-action', { detail: `format-${e.target.value}` }));
            }}
          >
            <option value="auto">Automatisch</option>
            <option value="number">Getal</option>
            <option value="currency">Valuta (€)</option>
            <option value="percentage">Percentage (%)</option>
            <option value="text">Tekst</option>
          </select>
          <RibbonButtonStack>
            <RibbonButton icon=".0" label="+Decimaal" size="small" onClick={() => {
              document.dispatchEvent(new CustomEvent('spreadsheet-action', { detail: 'decimals-up' }));
            }} />
            <RibbonButton icon=".←" label="-Decimaal" size="small" onClick={() => {
              document.dispatchEvent(new CustomEvent('spreadsheet-action', { detail: 'decimals-down' }));
            }} />
          </RibbonButtonStack>
        </RibbonGroup>

        <RibbonGroup label="Tekstgrootte">
          <select
            style={btnStyle}
            defaultValue="11"
            onChange={(e) => {
              document.dispatchEvent(new CustomEvent('spreadsheet-action', { detail: `fontsize-${e.target.value}` }));
            }}
          >
            {[8, 9, 10, 11, 12, 14, 16, 18, 20, 24].map(s => (
              <option key={s} value={s}>{s}px</option>
            ))}
          </select>
        </RibbonGroup>
      </div>
    </div>
  );
}
