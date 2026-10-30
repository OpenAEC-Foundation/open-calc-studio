import type { AppStore } from '@/state/appStore';
import type { DocumentTab } from '@/types/costModel';
import { serializeProject } from './fileService';

/** Capture the active live state or the inactive tab's own context. */
export function serializeDocument(state: AppStore, doc: DocumentTab): string {
  const active = state.activeDocumentId === doc.id;
  const context = active ? state : doc.context;
  const json = serializeProject(
    { ...(active ? state.schedule : doc.schedule), ...(context ? { projectInfo: context.projectInfo } : {}) },
    active ? state.items : doc.items, context?.companyInfo, context?.subSheets,
    context?.offerte, context?.snapshots,
  );
  if (!doc.hostProject) return json;
  const project = JSON.parse(json);
  return JSON.stringify({ ...doc.hostProject, ...project,
    createdAt: doc.hostProject.createdAt ?? project.createdAt,
    resourceLibrary: [...(doc.hostProject.resourceLibrary ?? []), ...project.resourceLibrary],
  });
}
export function projectContentKey(json: string): string {
  const project = JSON.parse(json); delete project.createdAt; delete project.modifiedAt;
  return JSON.stringify(project);
}
export function documentChangedSince(state: AppStore, id: string, saved: string): boolean {
  const doc = state.documents.find(d => d.id === id);
  return !!doc && projectContentKey(serializeDocument(state, doc)) !== projectContentKey(saved);
}
