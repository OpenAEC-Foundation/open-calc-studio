import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/state/appStore';
import { formatMoney, formatMoneyKeepZero, getNumberLocale } from '@/utils/formatting';

/**
 * Bedrag mét valutateken in de valuta van de begroting en de getalnotatie
 * (app-taal of de instelling "Getalnotatie"). Tekent opnieuw bij een andere
 * valuta, taal of notatie.
 * Standaard blijft 0 leeg (zoals in het raster); `keepZero` toont "€ 0,00".
 */
export function useMoney(options: { keepZero?: boolean } = {}): (value: number | null | undefined) => string {
  // Alleen voor het opnieuw tekenen: een taal- of notatiewissel stuurt
  // 'languageChanged' (zie i18n/numberFormatSync.ts).
  useTranslation();
  const currency = useAppStore(s => s.schedule.currency);
  const notation = getNumberLocale();
  const keepZero = !!options.keepZero;
  // `notation` hoort in de deps: de formatters lezen de notatie uit formatting.ts.
  return useCallback(
    (value: number | null | undefined) => (keepZero ? formatMoneyKeepZero(value, currency) : formatMoney(value, currency)),
    [currency, notation, keepZero],
  );
}
