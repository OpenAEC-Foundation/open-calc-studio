import { useAppStore } from '@/state/appStore';
import { uiText } from '@/i18n/uiText';
import { activeLibrariesOf, COUNTRY_LIBRARY, ownLibraryKey, priceCountryOf } from './priceLibraries';

type LibraryChoice = { priceCountry?: string; priceLibraries?: string[] };

/** The undo step of the last country choice, to merge the next one into. */
let lastStep: { entry: unknown; items: unknown; documentId: string } | null = null;

/**
 * Change the price-library choice of the active estimate (issues #93, #104):
 * one undo step that marks the document modified. The store then rebuilds the
 * library list (appStore subscription).
 */
function changeLibraryChoice(next: LibraryChoice, description: string, mergeable: boolean): void {
  const state = useAppStore.getState();
  const before: LibraryChoice = {};
  if (next.priceCountry !== undefined && next.priceCountry !== priceCountryOf(state.schedule)) before.priceCountry = priceCountryOf(state.schedule);
  if (next.priceLibraries !== undefined) {
    const current = activeLibrariesOf(state.schedule);
    if (next.priceLibraries.join('\n') !== current.join('\n')) before.priceLibraries = current;
  }
  if (Object.keys(before).length === 0) return;
  const patch: LibraryChoice = {};
  if (before.priceCountry !== undefined) patch.priceCountry = next.priceCountry;
  if (before.priceLibraries !== undefined) patch.priceLibraries = [...next.priceLibraries!];

  // On Windows a closed <select> fires change on every arrow key or typed
  // letter. Consecutive country choices with nothing in between are one undo step.
  const top = state.undoStack[state.undoStack.length - 1];
  const merge = mergeable && !!lastStep && top === lastStep.entry && state.items === lastStep.items && state.activeDocumentId === lastStep.documentId;
  if (!merge) state.pushHistory(state.items, description, undefined, before);
  state.setSchedule(patch);
  if (state.activeDocumentId) state.updateDocument(state.activeDocumentId, { isModified: true });
  if (mergeable && !merge) {
    const after = useAppStore.getState();
    lastStep = { entry: after.undoStack[after.undoStack.length - 1], items: after.items, documentId: after.activeDocumentId };
  } else if (!mergeable) {
    lastStep = null;
  }
}

/** Choose the price-library country of the active estimate (issue #93). */
export function choosePriceCountry(code: string): void {
  changeLibraryChoice({ priceCountry: code.toUpperCase() }, uiText('pricing.countryChange', 'Price library country'), true);
}

/** Set the libraries the active estimate uses, in order (issue #104). */
export function setActiveLibraries(keys: string[]): void {
  changeLibraryChoice({ priceLibraries: [...new Set(keys)] }, uiText('pricing.librariesChange', 'Price libraries of the estimate'), false);
}

/** Switch one library on or off for the active estimate; a library switched on goes last. */
export function toggleLibrary(key: string, on: boolean): void {
  const current = activeLibrariesOf(useAppStore.getState().schedule);
  setActiveLibraries(on ? [...current.filter(k => k !== key), key] : current.filter(k => k !== key));
}

/** Use an own library in the active estimate, after the libraries it already uses. */
export function activateOwnLibrary(id: string): void {
  const key = ownLibraryKey(id);
  if (!activeLibrariesOf(useAppStore.getState().schedule).includes(key)) toggleLibrary(key, true);
}

/** Every library on this computer: the country library, then the given own libraries. */
export function activateAllLibraries(ownIds: string[]): void {
  const current = activeLibrariesOf(useAppStore.getState().schedule);
  const all = [COUNTRY_LIBRARY, ...ownIds.map(ownLibraryKey)];
  // Keep the order the user had; add what is missing at the end.
  setActiveLibraries([...current.filter(k => all.includes(k)), ...all.filter(k => !current.includes(k)), ...current.filter(k => !all.includes(k))]);
}
