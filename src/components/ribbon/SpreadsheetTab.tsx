import { useTranslation } from "react-i18next";
import RibbonButton from "./RibbonButton";
import RibbonGroup from "./RibbonGroup";
import RibbonButtonStack from "./RibbonButtonStack";
import { useAppStore } from "../../state/appStore";

export default function SpreadsheetTab() {
  const { t } = useTranslation("ribbon");
  const {
    subSheets, addSubSheet, removeSubSheet, activeSubSheetId, setActiveSubSheet, setActiveContentTab,
  } = useAppStore();

  // Blad openen/aanmaken schakelt óók de content-weergave naar 'spreadsheet',
  // net als de onderbalk — anders raakt de navigatiestatus uit de pas en
  // lijkt er geen weg terug naar de begroting (Data-tab).
  const openSheet = (id: string | null) => {
    setActiveSubSheet(id);
    setActiveContentTab('spreadsheet');
  };

  const btnStyle = { fontSize: 12, padding: '2px 8px', border: '1px solid var(--theme-border)', borderRadius: 3, background: 'var(--theme-surface)', color: 'var(--theme-text)', cursor: 'pointer', minWidth: 28, height: 24 };

  return (
    <div className="ribbon-content">
      <div className="ribbon-groups">
        <RibbonGroup label={t('spreadsheet.sheets')}>
          <RibbonButton icon="➕" label={t('spreadsheet.newSheet')} onClick={() => openSheet(addSubSheet())} />
          <RibbonButton icon="🗑️" label={t('spreadsheet.deleteSheet')} onClick={() => activeSubSheetId && removeSubSheet(activeSubSheetId)} disabled={!activeSubSheetId} />
          {subSheets.length > 0 && (
            <select
              style={{ ...btnStyle, width: 100 }}
              value={activeSubSheetId || ''}
              onChange={(e) => openSheet(e.target.value || null)}
            >
              {subSheets.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
        </RibbonGroup>

        <RibbonGroup label={t('spreadsheet.format')}>
          <RibbonButtonStack>
            <RibbonButton icon="𝐁" label={t('spreadsheet.bold')} size="small" onClick={() => {
              // Dispatch event to SubSheetEditor to toggle bold on selection
              document.dispatchEvent(new CustomEvent('spreadsheet-action', { detail: 'bold' }));
            }} />
            <RibbonButton icon="𝐼" label={t('spreadsheet.italic')} size="small" onClick={() => {
              document.dispatchEvent(new CustomEvent('spreadsheet-action', { detail: 'italic' }));
            }} />
          </RibbonButtonStack>
          <RibbonButtonStack>
            <RibbonButton icon="⬅" label={t('spreadsheet.alignLeft')} size="small" onClick={() => {
              document.dispatchEvent(new CustomEvent('spreadsheet-action', { detail: 'align-left' }));
            }} />
            <RibbonButton icon="⬌" label={t('spreadsheet.alignCenter')} size="small" onClick={() => {
              document.dispatchEvent(new CustomEvent('spreadsheet-action', { detail: 'align-center' }));
            }} />
            <RibbonButton icon="➡" label={t('spreadsheet.alignRight')} size="small" onClick={() => {
              document.dispatchEvent(new CustomEvent('spreadsheet-action', { detail: 'align-right' }));
            }} />
          </RibbonButtonStack>
        </RibbonGroup>

        <RibbonGroup label={t('spreadsheet.number')}>
          <select
            style={btnStyle}
            defaultValue="auto"
            onChange={(e) => {
              document.dispatchEvent(new CustomEvent('spreadsheet-action', { detail: `format-${e.target.value}` }));
            }}
          >
            <option value="auto">{t('spreadsheet.formatAuto')}</option>
            <option value="number">{t('spreadsheet.formatNumber')}</option>
            <option value="currency">{t('spreadsheet.formatCurrency')}</option>
            <option value="percentage">{t('spreadsheet.formatPercentage')}</option>
            <option value="text">{t('spreadsheet.formatText')}</option>
          </select>
          <RibbonButtonStack>
            <RibbonButton icon=".0" label={t('spreadsheet.decimalUp')} size="small" onClick={() => {
              document.dispatchEvent(new CustomEvent('spreadsheet-action', { detail: 'decimals-up' }));
            }} />
            <RibbonButton icon=".←" label={t('spreadsheet.decimalDown')} size="small" onClick={() => {
              document.dispatchEvent(new CustomEvent('spreadsheet-action', { detail: 'decimals-down' }));
            }} />
          </RibbonButtonStack>
        </RibbonGroup>

        <RibbonGroup label={t('spreadsheet.textSize')}>
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
