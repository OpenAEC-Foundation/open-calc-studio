import { useAppStore } from '@/state/appStore';
import { uiText } from '@/i18n/uiText';
import { priceCountryOf } from './priceLibraries';

/**
 * Choose the price-library country of the active estimate (issue #93). One
 * undo step, like changing the currency; the store swaps the built-in
 * library (appStore subscription).
 */
export function choosePriceCountry(code: string): void {
  const state = useAppStore.getState();
  const previous = priceCountryOf(state.schedule);
  const next = code.toUpperCase();
  if (next === previous) return;
  // On Windows a closed <select> fires change on every arrow key or typed
  // letter. Consecutive choices with nothing in between are one undo step.
  const top = state.undoStack[state.undoStack.length - 1];
  const merge = !!lastStep && top === lastStep.entry && state.items === lastStep.items && state.activeDocumentId === lastStep.documentId;
  if (!merge) state.pushHistory(state.items, uiText('pricing.countryChange', 'Price library country'), undefined, { priceCountry: previous });
  state.setSchedule({ priceCountry: next });
  if (state.activeDocumentId) state.updateDocument(state.activeDocumentId, { isModified: true });
  if (!merge) {
    const after = useAppStore.getState();
    lastStep = { entry: after.undoStack[after.undoStack.length - 1], items: after.items, documentId: after.activeDocumentId };
  }
}

/** The undo step of the last country choice, to merge the next one into. */
let lastStep: { entry: unknown; items: unknown; documentId: string } | null = null;
