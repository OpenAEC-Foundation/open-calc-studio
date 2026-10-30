import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { useAppStore } from '@/state/appStore';
import { openHostedFile, saveHostedFile } from '@/services/file/hostFileActions';
import { getSiteHost, observeSiteHost, type SiteHost } from '@/services/file/siteHost';
import { deserializeProject } from '@/services/file/fileService';
const sample = readFileSync('public/data/voorbeeld.ifcCalc', 'utf8');
function host(): SiteHost {
  return { initialFileId: 'a', list: vi.fn(async () => [{ id: 'a', name: 'Estimate.ifcCalc', modified: '2026-10-26' }]),
    open: vi.fn(async () => ({ id: 'a', name: 'Estimate.ifcCalc', version: '1', readOnly: false, bytes: new TextEncoder().encode(sample) })),
    save: vi.fn(async () => ({ id: 'a', name: 'Estimate.ifcCalc', version: '2' })),
    versions: vi.fn(async () => [{ version: '1', modified: '2026-10-26' }]),
  };
}
beforeEach(() => { useAppStore.setState({ documents: [], activeDocumentId: '', items: [], subSheets: [] }); window.openaecHost = host(); });
afterEach(() => { delete window.openaecHost; vi.restoreAllMocks(); });
describe('site-host files', () => {
  it('isolates metadata, spreadsheets and snapshots between open documents', async () => {
    await openHostedFile('a');
    const state = useAppStore.getState(), firstId = state.activeDocumentId;
    state.setCompanyInfo({ ...state.companyInfo, name: 'Company A' });
    state.setProjectInfo({ locatie: 'Project A' });
    state.addSubSheet();
    const sheetId = useAppStore.getState().subSheets[0].id;
    state.setSubSheetCell(sheetId, 'A1', '123');
    state.addDocument({ fileName: 'B' });
    expect(useAppStore.getState().companyInfo.name).not.toBe('Company A');
    expect(useAppStore.getState().subSheets).toHaveLength(0);
    state.setActiveDocument(firstId);
    expect(useAppStore.getState().companyInfo.name).toBe('Company A');
    expect(useAppStore.getState().projectInfo.locatie).toBe('Project A');
    expect(useAppStore.getState().subSheets[0].cells.A1.value).toBe('123');
    await saveHostedFile(firstId);
    const saved = deserializeProject(new TextDecoder().decode(vi.mocked(window.openaecHost!.save).mock.calls[0][0]));
    expect(saved.companyInfo?.name).toBe('Company A');
    expect(saved.spreadsheets?.sheets[0].cells.A1.value).toBe('123');
  });
  it('opens and saves a real native file through the host with optimistic versioning', async () => {
    await openHostedFile('a', '1');
    const state = useAppStore.getState();
    const row = state.items.find(item => item.rowType === 'regel')!;
    state.updateItem(row.id, 'quantity', 42);
    await saveHostedFile(state.activeDocumentId);
    const [bytes, options] = vi.mocked(window.openaecHost!.save).mock.calls[0];
    expect(options).toEqual({ id: 'a', name: 'Estimate.ifcCalc', expectedVersion: '1' });
    expect(deserializeProject(new TextDecoder().decode(bytes)).items.find(item => item.id === row.id)!.quantity).toBe(42);
    expect(useAppStore.getState().documents[0]).toMatchObject({ isModified: false, hostFile: { version: '2' } });
    expect(window.openaecHost!.open).toHaveBeenCalledWith('a', '1');
  });
  it('retains edits and the old version when the host rejects a stale save', async () => {
    await openHostedFile('a');
    const state = useAppStore.getState(); state.updateDocument(state.activeDocumentId, { isModified: true });
    const conflict = Object.assign(new Error('Version conflict'), { code: 'VERSION_CONFLICT' });
    vi.mocked(window.openaecHost!.save).mockRejectedValueOnce(conflict);
    await expect(saveHostedFile(state.activeDocumentId)).rejects.toBe(conflict);
    expect(useAppStore.getState().documents[0]).toMatchObject({ isModified: true, hostFile: { version: '1' } });
  });
  it('blocks overwriting a read-only historical file, but permits Save as', async () => {
    await openHostedFile('a'); const state = useAppStore.getState();
    state.updateDocument(state.activeDocumentId, { hostFile: { id: 'a', version: '1', readOnly: true } });
    await expect(saveHostedFile(state.activeDocumentId)).rejects.toThrow('read-only');
    expect(window.openaecHost!.save).not.toHaveBeenCalled();
    await saveHostedFile(state.activeDocumentId, true);
    expect(vi.mocked(window.openaecHost!.save).mock.calls[0][1]).not.toHaveProperty('id');
  });
  it('does not mark edits made during an asynchronous save as saved', async () => {
    await openHostedFile('a'); const state = useAppStore.getState();
    let finish!: (file: { id: string; name: string; version: string }) => void;
    vi.mocked(window.openaecHost!.save).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = saveHostedFile(state.activeDocumentId);
    state.updateItem(state.items.find(item => item.rowType === 'regel')!.id, 'quantity', 99);
    finish({ id: 'a', name: 'Estimate.ifcCalc', version: '2' }); await pending;
    expect(useAppStore.getState().documents[0].isModified).toBe(true);
  });
  it('recognizes a host installed after startup and stops observing on cleanup', () => {
    delete window.openaecHost; const changed = vi.fn(); const stop = observeSiteHost(changed);
    expect(changed).toHaveBeenLastCalledWith(undefined);
    window.openaecHost = host(); window.dispatchEvent(new Event('openaec-host-ready'));
    expect(changed).toHaveBeenLastCalledWith(getSiteHost()); stop();
    window.openaecHost = host(); window.dispatchEvent(new Event('openaec-host-ready'));
    expect(changed).toHaveBeenCalledTimes(2);
  });
});
