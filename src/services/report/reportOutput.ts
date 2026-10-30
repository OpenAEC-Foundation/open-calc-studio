import { useAppStore } from '@/state/appStore';
import { isTauriEnvironment, nativeDialogDefaultPath } from '@/services/file/nativeFileService';
import { exportPdf } from '@/services/mcp/apiExports';
import { printBudget } from '@/services/print/printService';
import { uiText } from '@/i18n/uiText';
import type { ReportView } from '@/state/slices/uiSlice';

/** The same PDF generator and current report options for print, export and MCP. */
export async function outputCurrentReport(mode: 'print' | 'export', view?: ReportView): Promise<void> {
  const state = useAppStore.getState(), reportView = view ?? state.reportView;
  if (!isTauriEnvironment()) {
    if (reportView === 'offerte') throw new Error(uiText('report.quotationDesktopRequired', 'Quotation PDFs require the desktop application.'));
    await printBudget(state.schedule, state.items, reportView, state.showHoeveelheid, state.companyInfo, undefined, state.pageOrientation, state.pageSize);
    return;
  }
  const { join, tempDir } = await import('@tauri-apps/api/path');
  let outputPath: string | null;
  if (mode === 'print') outputPath = await join(await tempDir(), `ocs-${reportView}-${Date.now()}.pdf`);
  else {
    const active = state.documents.find(doc => doc.id === state.activeDocumentId);
    const base = reportView === 'offerte' ? `Offerte_${state.offerte.offerteNummer || 'concept'}` : (active?.fileName || state.schedule.projectName || state.schedule.name || 'Budget').replace(/\.(ifcCalc|ifcx|ocs)$/i, '');
    let defaultPath = `${base.replace(/[\\/:*?"<>|]/g, '_')}.pdf`;
    if (active?.filePath) {
      const separator = active.filePath.includes('\\') ? '\\' : '/';
      const directory = active.filePath.slice(0, active.filePath.lastIndexOf(separator));
      if (directory) defaultPath = `${directory}${separator}${defaultPath}`;
    }
    const { save } = await import('@tauri-apps/plugin-dialog');
    outputPath = await save({ defaultPath: nativeDialogDefaultPath(defaultPath), filters: [{ name: 'PDF', extensions: ['pdf'] }] });
  }
  if (!outputPath) return;
  if (useAppStore.getState().activeDocumentId !== state.activeDocumentId) throw new Error(uiText('report.documentChanged', 'The active document changed. Try again in the intended estimate.'));
  await exportPdf({ outputPath, reportView });
  const { openPath } = await import('@tauri-apps/plugin-opener');
  await openPath(outputPath);
}
