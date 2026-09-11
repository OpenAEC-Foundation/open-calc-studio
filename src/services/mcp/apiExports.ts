/**
 * Exports die via de REST API (POST /api/v1/export/pdf en /export/ifc) worden
 * aangevraagd. Rust stuurt de aanvraag als `mcp-mutation` naar de webview en
 * wacht op het antwoord dat we hier via `api_export_result` terugmelden — zo
 * krijgt de aanroeper een echte fout in plaats van altijd "success".
 *
 * De PDF gebruikt dezelfde opbouw als de lint-knop "Exporteer PDF" (labels en
 * getalnotatie in de rapporttaal); IFC gebruikt dezelfde generator als de
 * lint-knop "IFC".
 */
import { useAppStore } from '@/state/appStore';
import { itemsForReport } from '@/services/print/printService';
import { getReportRequestLocale } from '@/i18n/reportI18n';
import { generateIfcCostFile } from '@/services/ifc/ifcCostGenerator';
import { buildOfferteRequest } from '@/services/offerte/offerteRequest';

export type ApiExportAction = 'export_pdf_request' | 'export_ifc_request';

const PDF_VIEWS = new Set([
  'werkbeschrijving', 'hoofdaanneming', 'onderaanneming', 'inschrijfstaat',
  'nacalculatie', 'bouw1', 'ibis', 'directie', 'offerte',
]);

/** Uitvoerpad: opgegeven pad, anders naast de geopende begroting, anders de tijdelijke map. */
async function resolveOutputPath(requested: unknown, baseName: string, ext: string): Promise<string> {
  if (typeof requested === 'string' && requested.trim()) return requested.trim();
  const store = useAppStore.getState();
  const active = store.documents?.find((d) => d.id === store.activeDocumentId);
  const safeBase = (baseName || 'begroting').replace(/[\\/:*?"<>|]+/g, '_');
  if (active?.filePath) {
    const sep = active.filePath.includes('\\') ? '\\' : '/';
    const dir = active.filePath.substring(0, active.filePath.lastIndexOf(sep));
    if (dir) return `${dir}${sep}${safeBase}.${ext}`;
  }
  const { tempDir, join } = await import('@tauri-apps/api/path');
  return join(await tempDir(), `${safeBase}.${ext}`);
}

async function exportPdf(data: Record<string, unknown>): Promise<string> {
  const { invoke } = await import('@tauri-apps/api/core');
  const store = useAppStore.getState();
  const { schedule, items, companyInfo, showHoeveelheid } = store;
  if (!schedule || items.length === 0) throw new Error('no budget loaded');

  const reportView = String(data.reportView || 'bouw1');
  if (!PDF_VIEWS.has(reportView)) throw new Error(`unknown report_view "${reportView}"`);
  const outputPath = await resolveOutputPath(data.outputPath, `${schedule.name || 'begroting'}-${reportView}`, 'pdf');
  const locale = await getReportRequestLocale();

  if (reportView === 'offerte') {
    await invoke('generate_offerte_pdf', { request: { ...buildOfferteRequest(store), ...locale }, outputPath });
    return outputPath;
  }
  const request = {
    schedule,
    items: itemsForReport(schedule, items),
    reportView,
    pageSize: (data.pageSize as string) || store.pageSize,
    pageOrientation: (data.pageOrientation as string) || store.pageOrientation,
    showHoeveelheid,
    companyInfo,
    includeCover: false,
    includeSummary: false,
    ...locale,
  };
  // IBIS-stijl en directiebegroting delen de IBIS Typst-generator (zoals in de lint).
  const command = reportView === 'ibis' || reportView === 'directie' ? 'generate_ibis_report' : 'generate_pdf_report';
  await invoke(command, { request, outputPath });
  return outputPath;
}

async function exportIfc(data: Record<string, unknown>): Promise<string> {
  const { schedule, items, offerte } = useAppStore.getState();
  if (!schedule || items.length === 0) throw new Error('no budget loaded');
  const outputPath = await resolveOutputPath(data.outputPath ?? data.output_path, schedule.name || 'begroting', 'ifc');
  const { writeTextFile } = await import('@tauri-apps/plugin-fs');
  await writeTextFile(outputPath, generateIfcCostFile(schedule, items, offerte));
  return outputPath;
}

/** Voer de export uit en meld het resultaat terug aan de wachtende REST-aanroep. */
export async function handleApiExport(action: ApiExportAction, data: Record<string, unknown>): Promise<void> {
  const requestId = typeof data.requestId === 'string' ? data.requestId : null;
  let result: Record<string, unknown>;
  try {
    const outputPath = action === 'export_pdf_request' ? await exportPdf(data) : await exportIfc(data);
    result = { success: true, outputPath };
  } catch (err) {
    console.error(`[MCP Bridge] ${action} failed:`, err);
    result = { success: false, error: err instanceof Error ? err.message : String(err) };
  }
  if (!requestId) return;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('api_export_result', { requestId, result });
  } catch (err) {
    console.warn('[MCP Bridge] api_export_result failed:', err);
  }
}
