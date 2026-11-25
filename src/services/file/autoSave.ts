import { isNativeSavePath } from '@/hooks/useFileOperations';
import type { AppStore } from '@/state/appStore';

/**
 * Moet automatisch opslaan nu het actieve document wegschrijven? Alleen een
 * gewijzigd document met een eigen native pad: een geïmporteerd bestand
 * (.xlsx, .bc3 …) zou anders een Opslaan als-venster openen (knownbug 120).
 * Niet terwijl de vraag "Opslaan / Niet opslaan" openstaat, anders levert
 * "Niet opslaan" toch opgeslagen werk op (knownbug 281).
 */
export function shouldAutoSave(state: Pick<AppStore, 'settings' | 'documents' | 'activeDocumentId'>, unsavedPromptOpen: boolean): boolean {
  if (!state.settings.autoSave || unsavedPromptOpen) return false;
  const doc = state.documents.find((d) => d.id === state.activeDocumentId);
  return !!(doc?.isModified && doc.filePath && isNativeSavePath(doc.filePath));
}
