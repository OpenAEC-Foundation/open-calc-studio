import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAppStore } from '@/state/appStore';
import { createDefaultSchedule, createDefaultItems } from '@/data/defaultBudget';
import { handleApiExport } from '@/services/mcp/apiExports';

// De Tauri-modules bestaan niet in de testomgeving; we onderscheppen ze en
// controleren wat de export eraan doorgeeft.
const invoke = vi.fn(async (..._args: unknown[]): Promise<unknown> => undefined);
const writeTextFile = vi.fn(async (..._args: unknown[]): Promise<void> => undefined);
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a) }));
vi.mock('@tauri-apps/plugin-fs', () => ({ writeTextFile: (...a: unknown[]) => writeTextFile(...a) }));
vi.mock('@tauri-apps/api/path', () => ({
  tempDir: async () => 'C:/tmp',
  join: async (...parts: string[]) => parts.join('/'),
}));

const calls = (name: string) => invoke.mock.calls.filter((c) => c[0] === name);
const lastResult = () => {
  const all = calls('api_export_result');
  return all[all.length - 1]?.[1] as { requestId: string; result: Record<string, unknown> };
};

describe('REST-export via de MCP-bridge (export_pdf_request / export_ifc_request)', () => {
  beforeEach(() => {
    invoke.mockClear();
    writeTextFile.mockClear();
    useAppStore.setState({ schedule: createDefaultSchedule(), items: createDefaultItems(), documents: [], activeDocumentId: null } as never);
  });

  it('meldt een fout terug als er geen begroting geladen is', async () => {
    useAppStore.setState({ items: [] } as never);
    await handleApiExport('export_pdf_request', { requestId: 'r1', reportView: 'bouw1' });
    expect(calls('generate_pdf_report')).toHaveLength(0);
    expect(lastResult()).toEqual({ requestId: 'r1', result: { success: false, error: 'no budget loaded' } });
  });

  it('maakt de PDF met labels en getalnotatie in de rapporttaal en meldt het pad terug', async () => {
    await handleApiExport('export_pdf_request', { requestId: 'r2', reportView: 'hoofdaanneming', outputPath: 'C:/uit/begroting.pdf', pageSize: 'A3' });
    const [, args] = calls('generate_pdf_report')[0] as unknown as [string, { request: Record<string, unknown>; outputPath: string }];
    expect(args.outputPath).toBe('C:/uit/begroting.pdf');
    expect(args.request.reportView).toBe('hoofdaanneming');
    expect(args.request.pageSize).toBe('A3');
    expect((args.request.labels as Record<string, string>)['totals.contractSumExclVat']).toBeTruthy();
    expect((args.request.numberFormat as Record<string, string>).decimal).toBeTruthy();
    expect(lastResult()).toEqual({ requestId: 'r2', result: { success: true, outputPath: 'C:/uit/begroting.pdf' } });
  });

  it('stuurt IBIS/directie naar de IBIS-generator en wijst onbekende weergaven af', async () => {
    await handleApiExport('export_pdf_request', { requestId: 'r3', reportView: 'directie', outputPath: 'C:/uit/d.pdf' });
    expect(calls('generate_ibis_report')).toHaveLength(1);
    await handleApiExport('export_pdf_request', { requestId: 'r4', reportView: 'excel' });
    expect(lastResult().result).toEqual({ success: false, error: 'unknown report_view "excel"' });
  });

  it('schrijft IFC naast de begroting, of in de tijdelijke map als die niet opgeslagen is', async () => {
    await handleApiExport('export_ifc_request', { requestId: 'r5' });
    const [path, content] = writeTextFile.mock.calls[0] as unknown as [string, string];
    expect(path).toMatch(/^C:\/tmp\/.+\.ifc$/);
    expect(content.startsWith('ISO-10303-21')).toBe(true);
    expect(lastResult().result).toEqual({ success: true, outputPath: path });

    useAppStore.setState({ documents: [{ id: 'd1', fileName: 'x.ifcCalc', filePath: 'C:\\werk\\x.ifcCalc' }], activeDocumentId: 'd1' } as never);
    await handleApiExport('export_ifc_request', { requestId: 'r6' });
    expect((writeTextFile.mock.calls[1] as unknown as [string])[0]).toMatch(/^C:\\werk\\.+\.ifc$/);
  });

  it('meldt niets terug zonder requestId (oudere aanroep)', async () => {
    await handleApiExport('export_ifc_request', { outputPath: 'C:/uit/b.ifc' });
    expect(writeTextFile).toHaveBeenCalledTimes(1);
    expect(calls('api_export_result')).toHaveLength(0);
  });
});
