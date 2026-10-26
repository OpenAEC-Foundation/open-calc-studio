import { localStore } from '@/utils/browserStorage';
import { useAppStore } from '@/state/appStore';
import { deserializeProject, serializeProject } from './fileService';
import { getSiteHost, hostRecentPath, type HostVersion } from './siteHost';

function remember(id: string, name: string) {
  localStore.setItem('ocs-host-name:' + id, name);
  const state = useAppStore.getState();
  const path = hostRecentPath(id);
  state.updateSettings({ recentFiles: [path, ...(state.settings.recentFiles ?? []).filter(p => p !== path)].slice(0, 10) });
}

export async function openHostedFile(id: string, version?: HostVersion): Promise<void> {
  const host = getSiteHost();
  if (!host) throw new Error('The site storage is not available.');
  const file = await host.open(id, version);
  const project = deserializeProject(new TextDecoder().decode(file.bytes));
  const store = useAppStore.getState();
  store.addDocument({ id: crypto.randomUUID(), filePath: null, fileName: file.name, isModified: false,
    items: project.items, schedule: project.schedule,
    hostFile: { id: file.id, version: file.version, readOnly: file.readOnly },
    hostProject: project,
  });
  if (project.companyInfo) store.setCompanyInfo(project.companyInfo);
  store.setSubSheets(project.spreadsheets?.sheets ?? project.subSheets ?? []);
  if (project.offerte) store.setOfferte(project.offerte);
  store.setSnapshots(project.snapshots ?? []);
  if (project.schedule.projectInfo) store.setProjectInfo(project.schedule.projectInfo);
  remember(file.id, file.name);
}

function snapshot(documentId: string): string {
  const state = useAppStore.getState();
  const doc = state.documents.find(d => d.id === documentId);
  if (!doc) throw new Error('The document has been closed.');
  const active = state.activeDocumentId === documentId;
  const context = active ? state : doc.context ?? state;
  const schedule = { ...(active ? state.schedule : doc.schedule), projectInfo: context.projectInfo };
  const serialized = JSON.parse(serializeProject(schedule, active ? state.items : doc.items, context.companyInfo, context.subSheets, context.offerte, context.snapshots));
  return JSON.stringify({ ...doc.hostProject, ...serialized,
    resourceLibrary: doc.hostProject?.resourceLibrary ?? serialized.resourceLibrary,
    createdAt: doc.hostProject?.createdAt ?? serialized.createdAt,
  }, null, 2);
}

function contentKey(json: string): string {
  const project = JSON.parse(json);
  delete project.createdAt; delete project.modifiedAt;
  return JSON.stringify(project);
}

/** Keep the dirty flag on conflicts, errors, or edits made while saving. */
export async function saveHostedFile(documentId: string, asNew = false): Promise<void> {
  const host = getSiteHost();
  if (!host) throw new Error('The site storage is not available.');
  const doc = useAppStore.getState().documents.find(d => d.id === documentId);
  if (!doc) return;
  if (doc.hostFile?.readOnly && !asNew) throw new Error('This version is read-only. Use Save as to create a copy.');
  const json = snapshot(documentId);
  const file = await host.save(new TextEncoder().encode(json), {
    name: doc.fileName.endsWith('.ifcCalc') ? doc.fileName : `${doc.fileName}.ifcCalc`,
    ...(!asNew && doc.hostFile ? { id: doc.hostFile.id, expectedVersion: doc.hostFile.version } : {}),
  });
  const state = useAppStore.getState();
  if (state.documents.some(d => d.id === documentId)) {
    state.updateDocument(documentId, { filePath: null, fileName: file.name,
      hostFile: { id: file.id, version: file.version, readOnly: false },
      hostProject: JSON.parse(json),
      isModified: contentKey(snapshot(documentId)) !== contentKey(json),
    });
  }
  remember(file.id, file.name);
}
