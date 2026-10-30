import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { getSiteHost, observeSiteHost } from '@/services/file/siteHost';
import { PLATFORM_BUILD } from '@/services/buildFlags';
import { isEmbedded, getEmbedOptions } from '@/lib/hostRoot';
import { LANGUAGES, changeLanguage } from '@/i18n/config';
import { useAppStore } from '@/state/appStore';

const themes = new Set(['light', 'dark', 'blueprint', 'high-contrast-dark', 'high-contrast-light', 'system']);
export function isHostedPresentation(): boolean {
  return PLATFORM_BUILD || isEmbedded() || !!getSiteHost() || window.origin === 'null';
}

/** Read preferences on our own window; never access a cross-origin parent. */
export function readHostPresentation() {
  const host = getSiteHost();
  const embed = isEmbedded() ? getEmbedOptions() : {};
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const rawLocale = host?.locale ?? host?.taal ?? embed.locale ?? hash.get('taal');
  const rawTheme = host?.theme ?? host?.thema ?? embed.theme ?? hash.get('thema') ?? hash.get('theme');
  const code = rawLocale?.toLowerCase().replace('_', '-').split('-')[0];
  return {
    locale: LANGUAGES.some(language => language.code === code) ? code : undefined,
    theme: rawTheme && themes.has(rawTheme) ? rawTheme : 'light',
  };
}

export function useHostPresentation(ready: boolean, setTheme: Dispatch<SetStateAction<string>>): boolean {
  const [hosted, setHosted] = useState(isHostedPresentation);
  useEffect(() => {
    let active = true;
    let languageChange: Promise<unknown> = Promise.resolve();
    const sync = () => {
      const next = isHostedPresentation();
      setHosted(next);
      if (!ready || !next) return;
      const prefs = readHostPresentation();
      const state = useAppStore.getState();
      state.setSettings({ ...state.settings, theme: prefs.theme, ...(prefs.locale ? { locale: prefs.locale } : {}) });
      setTheme(prefs.theme);
      if (prefs.locale) {
        const locale = prefs.locale;
        languageChange = languageChange.then(() => active ? changeLanguage(locale) : undefined)
          .catch(error => { if (active) console.error('Host language could not be applied', error); });
      }
    };
    const stop = observeSiteHost(sync);
    window.addEventListener('hashchange', sync);
    return () => { active = false; stop(); window.removeEventListener('hashchange', sync); };
  }, [ready, setTheme]);
  return hosted;
}
