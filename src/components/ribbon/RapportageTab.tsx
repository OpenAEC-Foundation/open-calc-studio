import { useState } from "react";
import { useTranslation } from "react-i18next";
import Modal from "../common/Modal";
import { ReportLogoSettings } from "../report/ReportLogoSettings";
import RibbonButton from "./RibbonButton";
import RibbonGroup from "./RibbonGroup";
import RibbonButtonStack from "./RibbonButtonStack";
import {
  printIcon,
  pdfExportIcon,
  excelExportIcon,
  exportIcon,
  reportWerkbeschrijvingIcon,
  reportHoofdaannemingIcon,
  reportOnderaannemingIcon,
  reportInschrijfstaatIcon,
  reportNacalculatieIcon,
  reportBouw1Icon,
  reportBouw2Icon,
  reportDirectieIcon,
  portraitIcon,
  landscapeIcon,
  pageSizeIcon,
  settingsIcon,
} from "./icons";
import "./rapportProps.css";
import { useAppStore } from "../../state/appStore";
import { printBudget, itemsForReport } from "../../services/print/printService";
import { getReportRequestLocale } from "../../i18n/reportI18n";
import { generateIfcCostFile } from "../../services/ifc/ifcCostGenerator";
import type { ReportView } from "../../state/slices/uiSlice";

// Tauri API (lazy-loaded to support browser-only mode)
const tauriApi = (() => {
  let cached: { invoke: typeof import("@tauri-apps/api/core")["invoke"]; save: typeof import("@tauri-apps/plugin-dialog")["save"] } | null | undefined;
  return async () => {
    if (cached !== undefined) return cached;
    try {
      const [core, dialog] = await Promise.all([
        import("@tauri-apps/api/core"),
        import("@tauri-apps/plugin-dialog"),
      ]);
      cached = { invoke: core.invoke, save: dialog.save };
    } catch {
      cached = null;
    }
    return cached;
  };
})();

const REPORT_VIEWS: { value: ReportView; labelKey: string; icon: string; titleKey: string }[] = [
  { value: 'werkbeschrijving', labelKey: 'rapportage.viewWerkbeschrijving', icon: reportWerkbeschrijvingIcon, titleKey: 'rapportage.viewWerkbeschrijvingTitle' },
  { value: 'hoofdaanneming', labelKey: 'rapportage.viewHoofdaanneming', icon: reportHoofdaannemingIcon, titleKey: 'rapportage.viewHoofdaannemingTitle' },
  { value: 'onderaanneming', labelKey: 'rapportage.viewOnderaanneming', icon: reportOnderaannemingIcon, titleKey: 'rapportage.viewOnderaannemingTitle' },
  { value: 'inschrijfstaat', labelKey: 'rapportage.viewInschrijfstaat', icon: reportInschrijfstaatIcon, titleKey: 'rapportage.viewInschrijfstaatTitle' },
  { value: 'nacalculatie', labelKey: 'rapportage.viewNacalculatie', icon: reportNacalculatieIcon, titleKey: 'rapportage.viewNacalculatieTitle' },
  { value: 'bouw1', labelKey: 'rapportage.viewBouw1', icon: reportBouw1Icon, titleKey: 'rapportage.viewBouw1Title' },
  { value: 'ibis', labelKey: 'rapportage.viewBouw2', icon: reportBouw2Icon, titleKey: 'rapportage.viewBouw2Title' },
  { value: 'directie', labelKey: 'rapportage.viewDirectie', icon: reportDirectieIcon, titleKey: 'rapportage.viewDirectieTitle' },
];

export default function RapportageTab() {
  const { t } = useTranslation("ribbon");
  const { schedule, items, offerte, setActiveContentTab, reportView, setReportView, showHoeveelheid, toggleHoeveelheid, companyInfo, pageOrientation, setPageOrientation, pageSize, setPageSize, setReportShowChanges, setSchedule } = useAppStore();
  const [showLogos, setShowLogos] = useState(false);
  const [showProps, setShowProps] = useState(false);

  const handlePrint = async () => {
    const tauri = await tauriApi();
    if (tauri) {
      // In Tauri: export to temp PDF and open it (OS print dialog)
      try {
        const tempPath = `${await tauri.invoke('plugin:fs|resolve_path', { path: '', directory: 'Temp' }).catch(() => 'C:/Users/rickd/AppData/Local/Temp')}/ocs-print-${Date.now()}.pdf`;
        await tauri.invoke('generate_pdf_report', {
          request: { schedule, items: itemsForReport(schedule, items), reportView, pageSize, pageOrientation, showHoeveelheid, companyInfo, includeCover: false, includeSummary: false, ...(await getReportRequestLocale()) },
          outputPath: tempPath,
        });
        const { openPath } = await import('@tauri-apps/plugin-opener');
        await openPath(tempPath);
      } catch (err) {
        // Fallback to HTML print
        void printBudget(schedule, items, reportView, showHoeveelheid, companyInfo, undefined, pageOrientation, pageSize);
      }
    } else {
      void printBudget(schedule, items, reportView, showHoeveelheid, companyInfo, undefined, pageOrientation, pageSize);
    }
  };

  const handlePdfExport = async () => {
    const tauri = await tauriApi();
    if (tauri) {
      try {
        const store = useAppStore.getState();
        const active = store.documents?.find((d) => d.id === store.activeDocumentId);
        let defaultPath: string;
        if (active?.filePath) {
          defaultPath = active.filePath.replace(/\.(ocs|ifcCalc|ifcx)$/i, '.pdf');
        } else {
          const base = (active?.fileName ?? schedule.projectName ?? schedule.name ?? 'Begroting').replace(/\.(ocs|ifcCalc|ifcx)$/i, '');
          defaultPath = `${base}.pdf`;
        }
        const outputPath = await tauri.save({
          filters: [{ name: 'PDF', extensions: ['pdf'] }],
          defaultPath,
        });
        if (!outputPath) return;
        const request = { schedule, items: itemsForReport(schedule, items), reportView, pageSize, pageOrientation, showHoeveelheid, companyInfo, includeCover: false, includeSummary: false, ...(await getReportRequestLocale()) };
        // IBIS-stijl en directiebegroting delen de IBIS Typst-generator.
        const command = (reportView === 'ibis' || reportView === 'directie') ? 'generate_ibis_report' : 'generate_pdf_report';
        await tauri.invoke(command, { request, outputPath });
        // Open the exported PDF
        const { openPath } = await import('@tauri-apps/plugin-opener');
        await openPath(outputPath);
      } catch (err) {
        alert(`${t("rapportage.pdfExportFailed")}: ${err}`);
      }
    } else {
      void printBudget(schedule, items, reportView, showHoeveelheid, companyInfo, undefined, pageOrientation, pageSize);
    }
  };

  const handleExcelExport = async () => {
    try {
      const { exportInschrijfstaat } = await import('@/services/export/inschrijfstaatExporter');
      await exportInschrijfstaat(schedule, items);
    } catch (err) {
      alert(`${t("rapportage.excelExportFailed")}: ${err}`);
    }
  };

  const handleIfcExport = () => {
    const ifc = generateIfcCostFile(schedule, items, offerte);
    const blob = new Blob([ifc], { type: "application/x-step" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${schedule.name || "begroting"}.ifc`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleViewClick = (view: ReportView) => {
    setReportView(view);
    setActiveContentTab("rapport");
  };

  return (
    <div className="ribbon-content">
      <div className="ribbon-groups">
        <RibbonGroup label={t('rapportage.reporting')}>
          {REPORT_VIEWS.map((v) => (
            <RibbonButton
              key={v.value}
              icon={v.icon}
              label={t(v.labelKey)}
              title={t(v.titleKey)}
              onClick={() => handleViewClick(v.value)}
              active={reportView === v.value}
            />
          ))}
        </RibbonGroup>

        <RibbonGroup label={t('rapportage.display')}>
          <RibbonButton
            icon={settingsIcon}
            label={t('rapportage.properties')}
            title={t('rapportage.propertiesTitle')}
            onClick={() => setShowProps(true)}
            active={showProps}
          />
          <RibbonButton
            icon={pageSizeIcon}
            label="A4"
            onClick={() => setPageSize('A4')}
            active={pageSize === 'A4'}
          />
          <RibbonButton
            icon={pageSizeIcon}
            label="A3"
            onClick={() => setPageSize('A3')}
            active={pageSize === 'A3'}
          />
          <RibbonButton
            icon={portraitIcon}
            label={t('rapportage.portrait')}
            onClick={() => setPageOrientation('portrait')}
            active={pageOrientation === 'portrait'}
          />
          <RibbonButton
            icon={landscapeIcon}
            label={t('rapportage.landscape')}
            onClick={() => setPageOrientation('landscape')}
            active={pageOrientation === 'landscape'}
          />
          <RibbonButton
            icon={pageSizeIcon}
            label={t('rapportage.logos')}
            title={t('rapportage.logosTitle')}
            onClick={() => setShowLogos(true)}
          />
        </RibbonGroup>

        <RibbonGroup label={t("rapportage.printing")}>
          <RibbonButton icon={printIcon} label={t("rapportage.print")} onClick={handlePrint} />
        </RibbonGroup>

        <RibbonGroup label={t("rapportage.export")}>
          <RibbonButton icon={pdfExportIcon} label={t("rapportage.pdfExport")} onClick={handlePdfExport} />
          <RibbonButtonStack>
            <RibbonButton icon={excelExportIcon} label={t("rapportage.excelExport")} size="small" onClick={handleExcelExport} />
            <RibbonButton icon={exportIcon} label={t("rapportage.ifcExport")} size="small" onClick={handleIfcExport} />
          </RibbonButtonStack>
        </RibbonGroup>
      </div>

      <Modal open={showLogos} onClose={() => setShowLogos(false)} title={t('rapportage.logosModalTitle')}>
        <ReportLogoSettings />
      </Modal>

      <Modal open={showProps} onClose={() => setShowProps(false)} title={t('rapportage.propsModalTitle')} className="rapport-props-dialog">
        <div className="rapport-props">
          <label className="rapport-props-row">
            <input
              type="checkbox"
              checked={showHoeveelheid}
              onChange={toggleHoeveelheid}
            />
            <span>
              <strong>{t('rapportage.propShowQuantities')}</strong>
              <em>{t('rapportage.propShowQuantitiesHelp')}</em>
            </span>
          </label>
          <label className="rapport-props-row">
            <input
              type="checkbox"
              checked={!!schedule.reportShowChanges}
              onChange={() => setReportShowChanges(!schedule.reportShowChanges)}
            />
            <span>
              <strong>{t('rapportage.propMarkChanges')}</strong>
              <em>{t('rapportage.propMarkChangesHelp')}</em>
            </span>
          </label>
          <label className="rapport-props-row">
            <input
              type="checkbox"
              checked={!!schedule.reportChapterTotalsOnly}
              onChange={() => setSchedule({ reportChapterTotalsOnly: !schedule.reportChapterTotalsOnly })}
            />
            <span>
              <strong>{t('rapportage.propChapterTotalsOnly')}</strong>
              <em>{t('rapportage.propChapterTotalsOnlyHelp')}</em>
            </span>
          </label>
          <label className="rapport-props-row">
            <input
              type="checkbox"
              checked={schedule.reportShowVerrekenbaar !== false}
              onChange={() => setSchedule({ reportShowVerrekenbaar: schedule.reportShowVerrekenbaar === false ? undefined : false })}
            />
            <span>
              <strong>{t('rapportage.propShowVerrekenbaar')}</strong>
              <em>{t('rapportage.propShowVerrekenbaarHelp')}</em>
            </span>
          </label>
          <label className="rapport-props-row">
            <input
              type="checkbox"
              checked={!!schedule.reportAmountsSubtotalsOnly}
              onChange={() => setSchedule({ reportAmountsSubtotalsOnly: !schedule.reportAmountsSubtotalsOnly })}
            />
            <span>
              <strong>{t('rapportage.propAmountsSubtotalsOnly')}</strong>
              <em>{t('rapportage.propAmountsSubtotalsOnlyHelp')}</em>
            </span>
          </label>
          <div className="rapport-props-row" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ minWidth: 120 }}>
              <strong>{t('rapportage.propHeader')}</strong>
              <em style={{ display: 'block' }}>{t('rapportage.propHeaderHelp')}</em>
            </span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
              {t('rapportage.height')}
              <input
                type="number" min={6} max={30} step={1}
                value={schedule.reportHeaderHeightMm ?? 10}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setSchedule({ reportHeaderHeightMm: Number.isFinite(v) ? Math.min(30, Math.max(6, v)) : undefined });
                }}
                style={{ width: 52 }}
                className="prop-input"
              /> mm
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
              {t('rapportage.lineColor')}
              <input
                type="color"
                value={schedule.reportHeaderLineColor ?? '#D97706'}
                onChange={(e) => setSchedule({ reportHeaderLineColor: e.target.value })}
                style={{ width: 34, height: 22, padding: 0, border: '1px solid var(--theme-border)', borderRadius: 3, background: 'none' }}
                title={t('rapportage.lineColorTitle')}
              />
            </label>
            <button
              style={{ fontSize: 10, background: 'none', border: '1px solid var(--theme-border)', borderRadius: 3, padding: '2px 8px', color: 'var(--theme-text-secondary)', cursor: 'pointer' }}
              onClick={() => setSchedule({ reportHeaderHeightMm: undefined, reportHeaderLineColor: undefined })}
            >{t('rapportage.default')}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
