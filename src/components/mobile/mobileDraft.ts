import { localStore } from '@/utils/browserStorage';
import { deserializeProject, serializeProject } from '@/services/file/fileService';
import { useAppStore } from '@/state/appStore';

const KEY = 'ocs-mobile-draft-v1';

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
    if (parsed.schedule.projectInfo) store.setProjectInfo(parsed.schedule.projectInfo);
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
    const project = serializeProject({ ...state.schedule, projectInfo: state.projectInfo }, state.items, state.companyInfo, state.subSheets, state.offerte);
    localStore.setItem(KEY, JSON.stringify({ fileName: doc.fileName, project }));
    return true;
  } catch (error) {
    console.warn('[Mobile] Draft could not be saved:', error);
    return false;
  }
}
