import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/state/appStore';
import { formatMoney, formatMoneyKeepZero } from '@/utils/formatting';

/**
 * Bedrag mét valutateken in de valuta van de begroting en de notatie van de
 * app-taal. Tekent opnieuw bij een andere valuta of taal.
 * Standaard blijft 0 leeg (zoals in het raster); `keepZero` toont "€ 0,00".
 */
export function useMoney(options: { keepZero?: boolean } = {}): (value: number | null | undefined) => string {
  const { i18n } = useTranslation();
  const currency = useAppStore(s => s.schedule.currency);
  const language = i18n.language;
  const keepZero = !!options.keepZero;
  // `language` hoort in de deps: de formatters lezen de taal uit formatting.ts.
  return useCallback(
    (value: number | null | undefined) => (keepZero ? formatMoneyKeepZero(value, currency) : formatMoney(value, currency)),
    [currency, language, keepZero],
  );
}
