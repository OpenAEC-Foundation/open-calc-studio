import { localStore } from '@/utils/browserStorage';
import { deserializeProject, serializeProject } from '@/services/file/fileService';
import { useAppStore } from '@/state/appStore';

const KEY = 'ocs-mobile-draft-v1';
let legacyRestored = false;
/** Called only after the complete replacement journal has committed. */
export function completeLegacyDraftMigration(): void {
  if (!legacyRestored) return;
  try { window.localStorage.removeItem(KEY); legacyRestored = false; } catch { /* Keep the legacy copy if removal is unavailable. */ }
}

/** Restore the last active browser document before the bundled example loads. */
export function restoreMobileDraft(): boolean {
  try {
    const raw = localStore.getItem(KEY);
    if (!raw) return false;
    const draft = JSON.parse(raw) as { fileName: string; project: string };
    if (!draft.fileName || !draft.project) return false;
    const parsed = deserializeProject(draft.project);
    const store = useAppStore.getState();
    store.addDocument({ id: crypto.randomUUID(), filePath: null, fileName: draft.fileName, isModified: true, items: parsed.items, schedule: parsed.schedule });
    if (parsed.companyInfo) store.setCompanyInfo(parsed.companyInfo);
    store.setSubSheets(parsed.spreadsheets?.sheets ?? parsed.subSheets ?? []);
    if (parsed.offerte) store.setOfferte(parsed.offerte);
    store.setSnapshots(parsed.snapshots ?? []);
    if (parsed.schedule.projectInfo) store.setProjectInfo(parsed.schedule.projectInfo);
    legacyRestored = true;
    return true;
  } catch (error) {
    console.warn('[Mobile] Draft could not be restored:', error);
    return false;
  }
}

/** Local crash/refresh recovery; explicit Save still downloads the portable project. */
export function saveMobileDraft(): boolean {
  try {
    const state = useAppStore.getState();
    const doc = state.documents.find((candidate) => candidate.id === state.activeDocumentId);
    if (!doc) return false;
    const project = serializeProject({ ...state.schedule, projectInfo: state.projectInfo }, state.items, state.companyInfo, state.subSheets, state.offerte, state.snapshots);
    // Legacy migration helper only. Never report the preferences memory fallback as durable.
    window.localStorage.setItem(KEY, JSON.stringify({ fileName: doc.fileName, project }));
    return true;
  } catch (error) {
    console.warn('[Mobile] Draft could not be saved:', error);
    return false;
  }
}
