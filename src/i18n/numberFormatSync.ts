import i18next from './config';
import { useAppStore } from '@/state/appStore';
import { setNumberFormatPreference } from '@/utils/formatting';

/**
 * Koppelt de instelling "Getalnotatie" (settings.numberFormat) aan de
 * getalnotatie in utils/formatting (issue #65).
 *
 * Bij een wijziging tekent de app opnieuw zoals bij een taalwissel: dezelfde
 * 'languageChanged' laat react-i18next alle vertaalde onderdelen opnieuw
 * renderen (rastercellen, totalen, invoervelden met de notatie in hun key).
 */
let current = useAppStore.getState().settings?.numberFormat;
setNumberFormatPreference(current);

useAppStore.subscribe((state) => {
  const next = state.settings?.numberFormat;
  if (next === current) return;
  current = next;
  setNumberFormatPreference(next);
  i18next.emit('languageChanged', i18next.language);
});
