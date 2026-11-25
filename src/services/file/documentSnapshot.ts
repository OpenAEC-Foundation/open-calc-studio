import type { AppStore } from '@/state/appStore';
import type { DocumentTab, ResourceLibraryItem } from '@/types/costModel';
import { serializeProject } from './fileService';

/**
 * Prijsartikelen van een gehost bestand samenvoegen op id: de gehoste
 * artikelen blijven staan (met hun volledige gegevens), artikelen die in deze
 * sessie zijn toegevoegd komen erachter. Voorheen gaf het herstel dubbelen en
 * liet opslaan bij de host de nieuwe artikelen weg (knownbug 113).
 */
export function mergeResourceLibraries(hosted: ResourceLibraryItem[] | undefined, current: ResourceLibraryItem[] | undefined): ResourceLibraryItem[] {
  const merged = [...(hosted ?? [])];
  const seen = new Set(merged.map(article => article.id));
  for (const article of current ?? []) if (!seen.has(article.id)) { seen.add(article.id); merged.push(article); }
  return merged;
}

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
    resourceLibrary: mergeResourceLibraries(doc.hostProject.resourceLibrary, project.resourceLibrary),
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
