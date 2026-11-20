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
  state.pushHistory(state.items, uiText('pricing.countryChange', 'Price library country'), undefined, { priceCountry: previous });
  state.setSchedule({ priceCountry: next });
  if (state.activeDocumentId) state.updateDocument(state.activeDocumentId, { isModified: true });
}
