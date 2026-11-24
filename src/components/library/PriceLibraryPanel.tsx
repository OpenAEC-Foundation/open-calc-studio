import React, { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { uiText } from '@/i18n/uiText';
import { useAppStore } from '@/state/appStore';
import {
  activeLibrariesOf, COUNTRY_LIBRARY, missingOwnLibraries, ownLibraryKey, priceCountryOf, PRICE_LIBRARY_COUNTRIES,
} from '@/services/pricing/priceLibraries';
import { activateAllLibraries, choosePriceCountry, toggleLibrary } from '@/services/pricing/choosePriceCountry';
import { listOwnLibraries, loadOwnLibraries, ownLibrariesLoaded, ownLibraryLoadError, removeOwnLibrary, renameOwnLibrary, subscribeOwnLibraries, type OwnLibraryInfo } from '@/services/pricing/ownLibraries';
import { OWN_LIBRARY_FILE_TYPES } from '@/services/pricing/ownLibraryImport';
import { ownLibraryImportedMessage } from '@/services/pricing/installOwnLibrary';
import { importOwnLibraryFile } from './importOwnLibraryFile';
import { countryOptions } from '@/utils/countries';

/** Own libraries on this computer, live. */
export function useOwnLibraries(): OwnLibraryInfo[] {
  return useSyncExternalStore(subscribeOwnLibraries, listOwnLibraries);
}

export type PanelMessage = { text: string; kind: 'info' | 'error' } | null;

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

const Icon: React.FC<{ d: string }> = ({ d }) => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);
const ICON_RENAME = 'M11.5 2.5l2 2L6 12l-3 1 1-3 7.5-7.5z';
const ICON_UPDATE = 'M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v2.8h-2.8';
const ICON_REMOVE = 'M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 8.5h5.6l.7-8.5';
const ICON_IMPORT = 'M8 2.5v8M4.5 7L8 10.5 11.5 7M3 13.5h10';
const ICON_PLUS = 'M8 3v10M3 8h10';

/**
 * The price libraries of the active estimate (issues #93, #104), in the
 * sidebar of the library dialog: the country library and the own libraries on
 * this computer, each switched on or off for this estimate, plus import, new
 * version, rename and remove.
 */
export const PriceLibraryPanel: React.FC<{ onChange: () => void; onMessage: (message: PanelMessage) => void }> = ({ onChange, onMessage }) => {
  const { i18n } = useTranslation();
  const country = useAppStore(s => priceCountryOf(s.schedule));
  const schedule = useAppStore(s => s.schedule);
  const active = useMemo(() => activeLibrariesOf(schedule), [schedule]);
  const own = useOwnLibraries();
  // A store that could not be read: say so here, and try again when the dialog opens.
  const loadError = useSyncExternalStore(subscribeOwnLibraries, ownLibraryLoadError);
  useEffect(() => { if (ownLibraryLoadError() !== null) void loadOwnLibraries(); }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `own` changes when the libraries load
  const missing = useMemo(() => (ownLibrariesLoaded() ? missingOwnLibraries(schedule) : []), [schedule, own]);
  const countries = useMemo(() => countryOptions(PRICE_LIBRARY_COUNTRIES, country, i18n.language), [country, i18n.language]);
  const fileInput = useRef<HTMLInputElement>(null);
  const section = useRef<HTMLElement>(null);
  /** The button that had focus can be gone (first import, removed row): put focus on the import button. */
  const keepFocus = () => setTimeout(() => section.current?.querySelector<HTMLElement>('.rp-add-library, .rp-import-btn')?.focus());
  const updateId = useRef<string | undefined>(undefined);

  const openFile = (forUpdate?: string) => {
    updateId.current = forUpdate;
    onMessage(null);
    fileInput.current?.click();
  };

  const importFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    try {
      const prepared = await importOwnLibraryFile(file, { updateId: updateId.current });
      if (!prepared) return;
      onChange();
      onMessage({ text: ownLibraryImportedMessage(prepared), kind: 'info' });
      keepFocus();
    } catch (e) {
      onMessage({ text: messageOf(e), kind: 'error' });
    } finally {
      updateId.current = undefined;
      if (fileInput.current) fileInput.current.value = '';
    }
  }, [onChange, onMessage]);

  const rename = async (library: OwnLibraryInfo) => {
    const name = window.prompt(uiText('pricing.renamePrompt', 'New name for “{{name}}”:', { name: library.name }), library.name);
    if (name === null) return;
    try { await renameOwnLibrary(library.id, name); } catch (e) { onMessage({ text: messageOf(e), kind: 'error' }); }
  };

  const remove = async (library: OwnLibraryInfo) => {
    if (!window.confirm(uiText('pricing.ownRemoveConfirm', 'Remove “{{name}}” from this computer? Rows in estimates keep their prices; estimates that use it will say it is missing.', { name: library.name }))) return;
    try {
      await removeOwnLibrary(library.id);
      toggleLibrary(ownLibraryKey(library.id), false);
      onChange();
      onMessage(null);
      keepFocus();
    } catch (e) { onMessage({ text: messageOf(e), kind: 'error' }); }
  };

  const toggle = (key: string, on: boolean) => { toggleLibrary(key, on); onChange(); };
  const date = (iso: string) => { try { return new Date(iso).toLocaleDateString(i18n.language); } catch { return iso.slice(0, 10); } };
  const allOn = own.length > 0 && [COUNTRY_LIBRARY, ...own.map(l => ownLibraryKey(l.id))].every(k => active.includes(k));

  return (
    <section ref={section} className="rp-libraries" aria-labelledby="rp-libraries-title">
      <div className="rp-side-title">
        <span id="rp-libraries-title">{uiText('pricing.libraries', 'Price libraries')}</span>
        {own.length > 0 && (
          <span className="rp-side-title-actions">
            {!allOn && (
              <button type="button" className="rp-link-btn" onClick={() => { activateAllLibraries(own.map(l => l.id)); onChange(); }}>
                {uiText('pricing.allLibraries', 'All libraries')}
              </button>
            )}
            {/* After the first import, importing is a + here, so the list keeps its room. */}
            <button type="button" className="rp-icon-btn rp-add-library" title={uiText('pricing.importLibrary', 'Import library…')} aria-label={uiText('pricing.importLibrary', 'Import library…')} onClick={() => openFile()}>
              <Icon d={ICON_PLUS} />
            </button>
          </span>
        )}
      </div>

      <div className={`rp-lib${active.includes(COUNTRY_LIBRARY) ? ' on' : ''}`}>
        <input type="checkbox" id="rp-lib-country" checked={active.includes(COUNTRY_LIBRARY)} onChange={e => toggle(COUNTRY_LIBRARY, e.target.checked)} />
        <div className="rp-lib-text">
          <label htmlFor="rp-lib-country">{uiText('pricing.countryLibrary', 'Country library')}</label>
          <select
            id="resource-picker-country"
            aria-label={uiText('pricing.country', 'Country')}
            value={country}
            onChange={e => { choosePriceCountry(e.target.value); onChange(); }}
          >
            <optgroup label={uiText('pricing.withLibrary', 'With a price library')}>
              {countries.first.map(o => <option key={o.code} value={o.code}>{o.label}</option>)}
            </optgroup>
            <optgroup label={uiText('pricing.allCountries', 'All countries')}>
              {countries.rest.map(o => <option key={o.code} value={o.code}>{o.label}</option>)}
            </optgroup>
          </select>
        </div>
      </div>

      {own.map(library => {
        const key = ownLibraryKey(library.id);
        const id = `rp-lib-own-${encodeURIComponent(library.id)}`;
        return (
          <div className={`rp-lib${active.includes(key) ? ' on' : ''}`} key={library.id} data-library={library.id}>
            <input type="checkbox" id={id} checked={active.includes(key)} onChange={e => toggle(key, e.target.checked)} />
            <div className="rp-lib-text">
              <label htmlFor={id} title={library.name}>{library.name}</label>
              <span className="rp-lib-meta" title={library.fileName}>
                {uiText('pricing.ownMeta', '{{count}} resources · {{file}} · {{date}}', { count: library.count, file: library.fileName, date: date(library.importedAt) })}
                {[library.currency, library.region].filter(Boolean).join(' · ') && ` · ${[library.currency, library.region].filter(Boolean).join(' · ')}`}
              </span>
            </div>
            <span className="rp-lib-actions">
              <button type="button" className="rp-icon-btn" title={uiText('pricing.rename', 'Rename')} aria-label={`${uiText('pricing.rename', 'Rename')}: ${library.name}`} onClick={() => void rename(library)}><Icon d={ICON_RENAME} /></button>
              <button type="button" className="rp-icon-btn" title={uiText('pricing.newVersion', 'New version…')} aria-label={`${uiText('pricing.newVersion', 'New version…')}: ${library.name}`} onClick={() => openFile(library.id)}><Icon d={ICON_UPDATE} /></button>
              <button type="button" className="rp-icon-btn danger" title={uiText('pricing.remove', 'Remove')} aria-label={`${uiText('pricing.remove', 'Remove')}: ${library.name}`} onClick={() => void remove(library)}><Icon d={ICON_REMOVE} /></button>
            </span>
          </div>
        );
      })}

      {loadError !== null && (
        <div className="rp-lib missing" role="alert">
          <span className="rp-lib-warn" aria-hidden="true">!</span>
          <div className="rp-lib-text">
            <span className="rp-lib-meta">{uiText('pricing.ownStoreUnreadable', 'The own libraries on this computer could not be read ({{error}}), so nothing is saved, to keep them from being overwritten.', { error: loadError })}</span>
          </div>
        </div>
      )}

      {loadError === null && missing.map(id => (
        <div className="rp-lib missing" key={id} role="status">
          <span className="rp-lib-warn" aria-hidden="true">!</span>
          <div className="rp-lib-text">
            <span className="rp-lib-meta">{uiText('pricing.ownMissing', '“{{name}}” is not on this computer. Rows keep their prices; import the library again to use it.', { name: id })}</span>
            <button type="button" className="rp-link-btn" onClick={() => toggle(ownLibraryKey(id), false)}>{uiText('pricing.ownMissingRemove', 'Remove from this estimate')}</button>
          </div>
        </div>
      ))}

      {own.length === 0 && (
        <button type="button" className="rp-import-btn" onClick={() => openFile()}>
          <Icon d={ICON_IMPORT} />{uiText('pricing.importLibrary', 'Import library…')}
        </button>
      )}
      <input ref={fileInput} type="file" hidden accept={OWN_LIBRARY_FILE_TYPES} data-testid="own-library-file" onChange={e => void importFile(e.target.files?.[0])} />
    </section>
  );
};
