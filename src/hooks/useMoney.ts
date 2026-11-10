import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/state/appStore';
import { formatMoney } from '@/utils/formatting';

/**
 * Bedrag mét valutateken in de valuta van de begroting en de notatie van de
 * app-taal. Tekent opnieuw bij een andere valuta of taal.
 */
export function useMoney(): (value: number | null | undefined) => string {
  const { i18n } = useTranslation();
  const currency = useAppStore(s => s.schedule.currency);
  const language = i18n.language;
  // `language` hoort in de deps: formatMoney leest de taal uit formatting.ts.
  return useCallback((value: number | null | undefined) => formatMoney(value, currency), [currency, language]);
}
