import { useTranslation } from "react-i18next";
import RibbonButton from "./RibbonButton";
import RibbonGroup from "./RibbonGroup";
import RibbonButtonStack from "./RibbonButtonStack";
import {
  printIcon,
  previewIcon,
  pdfExportIcon,
  excelExportIcon,
  exportIcon,
  reportIcon,
  portraitIcon,
  landscapeIcon,
  pageSizeIcon,
} from "./icons";
import { useAppStore } from "../../state/appStore";
import { printBudget } from "../../services/print/printService";
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

const REPORT_VIEWS: { value: ReportView; label: string }[] = [
  { value: 'werkbeschrijving', label: 'Werkbeschr.' },
  { value: 'hoofdaanneming', label: 'Hoofdaann.' },
  { value: 'onderaanneming', label: 'Onderaann.' },
  { value: 'inschrijfstaat', label: 'Inschrijfstaat' },
  { value: 'nacalculatie', label: 'Nacalculatie' },
  { value: 'bouw1', label: 'Bouw 1' },
  { value: 'ibis', label: 'Bouw 2' },
];

export default function RapportageTab() {
  const { t } = useTranslation("ribbon");
  const { schedule, items, offerte, setActiveContentTab, reportView, setReportView, showHoeveelheid, toggleHoeveelheid, companyInfo, pageOrientation, setPageOrientation, pageSize, setPageSize } = useAppStore();

  const handlePrint = async () => {
    const tauri = await tauriApi();
    if (tauri) {
      // In Tauri: export to temp PDF and open it (OS print dialog)
      try {
        const tempPath = `${await tauri.invoke('plugin:fs|resolve_path', { path: '', directory: 'Temp' }).catch(() => 'C:/Users/rickd/AppData/Local/Temp')}/ocs-print-${Date.now()}.pdf`;
        await tauri.invoke('generate_pdf_report', {
          request: { schedule, items, reportView, pageSize, pageOrientation, showHoeveelheid, companyInfo, includeCover: false, includeSummary: false },
          outputPath: tempPath,
        });
        const { openPath } = await import('@tauri-apps/plugin-opener');
        await openPath(tempPath);
      } catch (err) {
        // Fallback to HTML print
        printBudget(schedule, items, reportView, showHoeveelheid, companyInfo, undefined, pageOrientation, pageSize);
      }
    } else {
      printBudget(schedule, items, reportView, showHoeveelheid, companyInfo, undefined, pageOrientation, pageSize);
    }
  };

  const handlePreview = () => {
    printBudget(schedule, items, reportView, showHoeveelheid, companyInfo, undefined, pageOrientation, pageSize);
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
        const request = { schedule, items, reportView, pageSize, pageOrientation, showHoeveelheid, companyInfo, includeCover: false, includeSummary: false };
        // IBIS-stijl heeft een dedicated command (eigen Typst-template).
        const command = reportView === 'ibis' ? 'generate_ibis_report' : 'generate_pdf_report';
        await tauri.invoke(command, { request, outputPath });
        // Open the exported PDF
        const { openPath } = await import('@tauri-apps/plugin-opener');
        await openPath(outputPath);
      } catch (err) {
        alert(`${t("rapportage.pdfExportFailed")}: ${err}`);
      }
    } else {
      printBudget(schedule, items, reportView, showHoeveelheid, companyInfo, undefined, pageOrientation, pageSize);
    }
  };

  const handleExcelExport = async () => {
    try {
      const { exportInschrijfstaat } = await import('@/services/export/inschrijfstaatExporter');
      await exportInschrijfstaat(schedule, items);
    } catch (err) {
      alert(`Excel export: ${err}`);
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
              icon={reportIcon}
              label={v.label}
              onClick={() => handleViewClick(v.value)}
              active={reportView === v.value}
            />
          ))}
        </RibbonGroup>

        <RibbonGroup label={t('rapportage.display')}>
          <RibbonButton
            icon={reportIcon}
            label={t('rapportage.quantities')}
            onClick={toggleHoeveelheid}
            active={showHoeveelheid}
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
    </div>
  );
}
