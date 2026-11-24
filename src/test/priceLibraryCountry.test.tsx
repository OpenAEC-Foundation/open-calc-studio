import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { changeLanguage } from '@/i18n/config';
import { ResourcePicker } from '@/components/library/ResourcePicker';
import { useAppStore } from '@/state/appStore';
import { createDefaultSchedule } from '@/data/defaultBudget';
import { deserializeProject, serializeProject } from '@/services/file/fileService';
import { choosePriceCountry } from '@/services/pricing/choosePriceCountry';
import { executeDesktopCommand } from '@/services/mcp/desktopCommand';
import {
  builtInLibraryItems, ENGLISH_CATALOGUE_ID, ENGLISH_LIBRARY, hasPriceLibrary, isBuiltInLibraryItem, libraryOfCountry, newEstimatePriceCountry,
  priceCountryOf, PRICE_LIBRARY_COUNTRIES, withBuiltInLibrary,
} from '@/services/pricing/priceLibraries';
import { COUNTRY_CODES, countryOptions } from '@/utils/countries';
import type { ResourceLibraryItem } from '@/types/costModel';

// Issue #93: a built-in price library per country, chosen per estimate.

const imported: ResourceLibraryItem = {
  id: 'zsx-1', code: 'Z.001', description: 'Imported resource', unit: 'st', resourceType: 'materiaal', defaultUnitPrice: 12, category: 'Imported',
};
const fromCatalogue: ResourceLibraryItem = { ...imported, id: 'own:1', code: 'O.001', catalogueId: 'own' };
/** The list of a country without a library: the English library (#86). */
const ENGLISH = () => builtInLibraryItems('IN');
const isEnglish = (item: ResourceLibraryItem) => item.catalogueId === ENGLISH_CATALOGUE_ID;

beforeEach(async () => {
  await changeLanguage('en');
  useAppStore.setState({
    schedule: createDefaultSchedule(), items: [], undoStack: [], redoStack: [],
    documents: [{ id: 'doc', fileName: 'a.ifcCalc', filePath: null, isModified: false, items: [], schedule: createDefaultSchedule() } as never], activeDocumentId: 'doc',
    resourceLibrary: [...builtInLibraryItems('NL'), imported, fromCatalogue],
    resourcePickerOpen: false, resourcePickerParentId: null,
  });
});

describe('price library registry', () => {
  it('keeps the article IDs of the Dutch library, so price links in saved estimates keep working', () => {
    const items = builtInLibraryItems('NL');
    expect(items).toHaveLength(98);
    expect(items[0].id).toBe('Nederlandse%20prijsbibliotheek%20%E2%80%94%20basis:nl-bouw-A.001');
    expect(items.every(isBuiltInLibraryItem)).toBe(true);
  });

  it('has an English library (INT): English names, no prices; every country without a library gets it, never NL (#86)', () => {
    expect(PRICE_LIBRARY_COUNTRIES).toEqual(['NL', ENGLISH_LIBRARY]);
    expect(ENGLISH_LIBRARY).toBe('INT');
    expect(hasPriceLibrary('IN')).toBe(false);
    expect(libraryOfCountry('IN')).toBe('INT');
    expect(libraryOfCountry('NL')).toBe('NL');
    const english = builtInLibraryItems(ENGLISH_LIBRARY);
    const nl = builtInLibraryItems('NL');
    expect(english).toHaveLength(nl.length);
    expect(english[0]).toMatchObject({ id: `${ENGLISH_CATALOGUE_ID}:en-A.001`, code: 'EN.A.001', description: 'Carpenter', unit: 'uur', resourceType: 'arbeid', category: 'Labour' });
    expect(ENGLISH_CATALOGUE_ID).toBe('ocs-en');
    expect(english.every(item => item.catalogueId === ENGLISH_CATALOGUE_ID && isBuiltInLibraryItem(item))).toBe(true);
    // No prices at all, not even a reference: Dutch euros would mislead elsewhere.
    expect(english.every(item => item.defaultUnitPrice === null && item.referenceUnitPrice === null && item.currency === undefined)).toBe(true);
    // Same resources as the Dutch list, row for row, and every name translated.
    // Only paint differs: m² instead of the Dutch list's "ls" (lump sum).
    expect(english.map(i => i.resourceType)).toEqual(nl.map(i => i.resourceType));
    expect(english.filter((g, n) => g.unit !== nl[n].unit).map(g => [g.code, g.unit])).toEqual([['EN.AF.005', 'm²'], ['EN.AF.006', 'm²']]);
    expect(english.map(i => i.code.replace(/^EN\./, ''))).toEqual(nl.map(i => i.code.replace(/^NL\.BOUW\./, '')));
    expect(english.filter((g, n) => g.description === nl[n].description || g.category === nl[n].category)).toEqual([]);
    expect(new Set(english.map(i => i.description)).size).toBe(english.length);
    expect(builtInLibraryItems('IN').map(i => i.id)).toEqual(english.map(i => i.id));
    expect(builtInLibraryItems('BE').map(i => i.id)).toEqual(english.map(i => i.id));
  });

  it('reads the country of an estimate, NL when unset or invalid; INT is the English library', () => {
    expect(priceCountryOf(createDefaultSchedule())).toBe('NL');
    expect(priceCountryOf({ priceCountry: 'be' })).toBe('BE');
    expect(priceCountryOf({ priceCountry: 'int' })).toBe('INT');
    expect(priceCountryOf({ priceCountry: 'Belgium' })).toBe('NL');
    expect(priceCountryOf(undefined)).toBe('NL');
  });

  it('a new estimate gets the library of the UI language: NL for Dutch, else English', () => {
    expect(newEstimatePriceCountry('nl')).toBe('NL');
    expect(newEstimatePriceCountry('nl-BE')).toBe('NL');
    for (const lang of ['en', 'de', 'pt', 'zh', '', undefined]) expect(newEstimatePriceCountry(lang)).toBe('INT');
  });

  it('a new estimate tab starts with that library; opened files keep theirs and old files stay NL', async () => {
    useAppStore.setState({ documents: [], activeDocumentId: '' });
    useAppStore.getState().addDocument({ fileName: 'new' });
    expect(useAppStore.getState().schedule.priceCountry).toBe('INT');
    expect(useAppStore.getState().resourceLibrary[0].code).toBe('EN.A.001');
    await changeLanguage('nl');
    useAppStore.getState().addDocument({ fileName: 'nieuw' });
    expect(useAppStore.getState().schedule.priceCountry).toBe('NL');
    expect(useAppStore.getState().resourceLibrary[0].description).toBe('Timmerman');
    await changeLanguage('en');
    useAppStore.getState().addDocument({ fileName: 'old.ifcCalc', schedule: createDefaultSchedule() });
    expect(priceCountryOf(useAppStore.getState().schedule)).toBe('NL');
  });

  it('swaps only the built-in articles and keeps imported and added resources', () => {
    const current = useAppStore.getState().resourceLibrary;
    const india = withBuiltInLibrary(current, 'IN');
    expect(india).toEqual([...ENGLISH(), imported, fromCatalogue]);
    const back = withBuiltInLibrary(india, 'NL');
    expect(back).toHaveLength(100);
    expect(back.some(isEnglish)).toBe(false);
    expect(back.slice(-2)).toEqual([imported, fromCatalogue]);
  });

  it('hands out copies, so editing a library row in the store never changes the registry', () => {
    builtInLibraryItems('NL')[0].description = 'changed';
    expect(builtInLibraryItems('NL')[0].description).toBe('Timmerman');
  });
});

describe('country per estimate', () => {
  it('choosing a country swaps the library, marks the document modified and is one undo step', () => {
    choosePriceCountry('in');
    let s = useAppStore.getState();
    expect(s.schedule.priceCountry).toBe('IN');
    expect(s.resourceLibrary).toEqual([...ENGLISH(), imported, fromCatalogue]);
    expect(s.documents[0].isModified).toBe(true);
    expect(s.undoStack).toHaveLength(1);

    s.undo();
    s = useAppStore.getState();
    expect(priceCountryOf(s.schedule)).toBe('NL');
    expect(s.resourceLibrary).toHaveLength(100);
    expect(s.resourceLibrary.some(isEnglish)).toBe(false);

    s.redo();
    expect(useAppStore.getState().schedule.priceCountry).toBe('IN');
    expect(useAppStore.getState().resourceLibrary).toEqual([...ENGLISH(), imported, fromCatalogue]);
  });

  it('choices in a row (arrow keys in the list) are one undo step; after an edit a new one', () => {
    choosePriceCountry('BE');
    choosePriceCountry('BG');
    choosePriceCountry('IN');
    expect(useAppStore.getState().undoStack).toHaveLength(1);
    useAppStore.getState().undo();
    expect(priceCountryOf(useAppStore.getState().schedule)).toBe('NL');

    choosePriceCountry('BE');
    useAppStore.setState({ items: [] });
    choosePriceCountry('IN');
    expect(useAppStore.getState().undoStack).toHaveLength(2);
  });

  it('choosing the current country does nothing', () => {
    choosePriceCountry('NL');
    expect(useAppStore.getState().undoStack).toHaveLength(0);
    expect(useAppStore.getState().schedule.priceCountry).toBeUndefined();
  });

  it('a step that does not change the country leaves the country alone on undo', () => {
    choosePriceCountry('IN');
    const s = useAppStore.getState();
    s.pushHistory(s.items, 'edit');
    s.undo();
    expect(useAppStore.getState().schedule.priceCountry).toBe('IN');
  });

  it('opening an estimate or switching tabs follows the country of that estimate', () => {
    useAppStore.getState().addDocument({ id: 'india', fileName: 'india.ifcCalc', items: [], schedule: { ...createDefaultSchedule(), priceCountry: 'IN' } });
    expect(useAppStore.getState().activeDocumentId).toBe('india');
    expect(useAppStore.getState().resourceLibrary).toEqual([...ENGLISH(), imported, fromCatalogue]);
    useAppStore.getState().setActiveDocument('doc');
    expect(useAppStore.getState().resourceLibrary).toHaveLength(100);
    expect(useAppStore.getState().resourceLibrary.some(isEnglish)).toBe(false);
    useAppStore.getState().setActiveDocument('india');
    expect(useAppStore.getState().resourceLibrary).toEqual([...ENGLISH(), imported, fromCatalogue]);
  });

  it('MCP openProject never brings Dutch articles saved in the file into another country', async () => {
    const nlArticle = builtInLibraryItems('NL')[0];
    const project = JSON.parse(serializeProject({ ...createDefaultSchedule(), priceCountry: 'BE' }, []));
    project.resourceLibrary = [nlArticle, imported];
    await executeDesktopCommand('openProject', { json: JSON.stringify(project), fileName: 'be.ifcCalc' });
    expect(useAppStore.getState().resourceLibrary).toEqual([...ENGLISH(), imported]);
  });

  it('is saved in the project file; old files without a country stay NL', () => {
    const saved = deserializeProject(serializeProject({ ...createDefaultSchedule(), priceCountry: 'BE' }, []));
    expect(saved.schedule.priceCountry).toBe('BE');
    expect(deserializeProject(serializeProject({ ...createDefaultSchedule(), priceCountry: 'INT' }, [])).schedule.priceCountry).toBe('INT');
    const old = deserializeProject(serializeProject(createDefaultSchedule(), []));
    expect(priceCountryOf(old.schedule)).toBe('NL');
  });
});

describe('country list', () => {
  it('has every ISO 3166-1 alpha-2 country once', () => {
    expect(COUNTRY_CODES).toHaveLength(249);
    expect(new Set(COUNTRY_CODES).size).toBe(249);
  });

  it('puts countries with a library first and keeps an unknown current code selectable', () => {
    const { first, rest } = countryOptions(['NL'], 'XK', 'en');
    expect(first).toEqual([{ code: 'NL', label: 'Netherlands' }]);
    expect(rest.some(o => o.code === 'NL')).toBe(false);
    expect(rest.some(o => o.code === 'XK')).toBe(true);
    expect(rest).toHaveLength(249);
  });
});

describe('library dialog', () => {
  let container: HTMLDivElement;
  let root: Root | undefined;
  beforeEach(() => { Element.prototype.scrollIntoView = vi.fn(); });
  afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; container?.remove(); });

  it('shows the country, swaps the list on a choice and says when a country has no library', async () => {
    useAppStore.setState({ resourcePickerOpen: true });
    container = document.createElement('div'); document.body.append(container); root = createRoot(container);
    await act(async () => { root!.render(<ResourcePicker />); });
    const select = container.querySelector<HTMLSelectElement>('#resource-picker-country')!;
    expect(select.value).toBe('NL');
    expect(container.textContent).toContain('Starter library: Netherlands');
    // The unverified reference price (Timmerman: 52 per hour) is no longer shown (#86).
    expect(container.textContent).not.toContain('Unverified reference');
    expect(container.querySelector('.rp-lib-english')).toBeNull();
    expect(container.querySelectorAll('.resource-picker-row')).toHaveLength(100);

    await act(async () => {
      select.value = 'IN';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(useAppStore.getState().schedule.priceCountry).toBe('IN');
    const note = container.querySelector('[role="status"]')?.textContent;
    expect(note).toContain('There is no price library for this country yet (India)');
    expect(note).toContain('You see the English library: common resources with English names and no prices');
    expect(container.querySelector('.rp-banner-action, .resource-picker-no-library button:not(.rp-banner-close)')).toBeNull();
    expect(container.querySelectorAll('.resource-picker-row')).toHaveLength(100);
    expect(container.textContent).toContain('Carpenter');
    expect(container.textContent).not.toContain('Timmerman');
    // The list mixes libraries, so each English row says where it comes from;
    // the country checkbox says it too, also once the banner is closed.
    expect(container.querySelector('.rp-lib-english')?.textContent).toBe('English');
    expect(container.querySelector('.resource-picker-row')?.textContent).toContain('English');

    // The English library is a choice of its own, next to the Netherlands.
    const withLibrary = [...select.querySelectorAll('optgroup')[0].querySelectorAll('option')].map(o => [o.value, o.textContent]);
    expect(withLibrary).toEqual(expect.arrayContaining([['NL', 'Netherlands'], ['INT', 'English']]));
    await act(async () => {
      select.value = 'INT';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(useAppStore.getState().schedule.priceCountry).toBe('INT');
    expect(container.textContent).toContain('You see the English library');
    expect(container.textContent).not.toContain('There is no price library');
    expect(container.querySelector('.rp-lib-english')).toBeNull();
    expect(container.querySelectorAll('.resource-picker-row')).toHaveLength(100);

    // An English article becomes a row without a price, tariff or price link.
    const carpenter = [...container.querySelectorAll('.resource-picker-row')].find(r => r.textContent?.includes('Carpenter'))!;
    await act(async () => { carpenter.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
    const row = useAppStore.getState().items.find(i => i.code === 'EN.A.001')!;
    expect(row).toMatchObject({ description: 'Carpenter', unit: 'uur', resourceLibraryId: `${ENGLISH_CATALOGUE_ID}:en-A.001`, normUnitPrice: null, tariefGroep: null, laborPrice: null });
    expect(row.priceOrigin).toBeUndefined();
    expect(row.notes).toContain('Price missing');
  });
});
