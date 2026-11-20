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
  builtInLibraryItems, hasPriceLibrary, isBuiltInLibraryItem, priceCountryOf, PRICE_LIBRARY_COUNTRIES, withBuiltInLibrary,
} from '@/services/pricing/priceLibraries';
import { COUNTRY_CODES, countryOptions } from '@/utils/countries';
import type { ResourceLibraryItem } from '@/types/costModel';

// Issue #93: a built-in price library per country, chosen per estimate.

const imported: ResourceLibraryItem = {
  id: 'zsx-1', code: 'Z.001', description: 'Imported resource', unit: 'st', resourceType: 'materiaal', defaultUnitPrice: 12, category: 'Imported',
};
const fromCatalogue: ResourceLibraryItem = { ...imported, id: 'own:1', code: 'O.001', catalogueId: 'own' };

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

  it('has no built-in articles for a country without a library, and never falls back to NL', () => {
    expect(PRICE_LIBRARY_COUNTRIES).toContain('NL');
    expect(hasPriceLibrary('IN')).toBe(false);
    expect(builtInLibraryItems('IN')).toEqual([]);
  });

  it('reads the country of an estimate, NL when unset or invalid', () => {
    expect(priceCountryOf(createDefaultSchedule())).toBe('NL');
    expect(priceCountryOf({ priceCountry: 'be' })).toBe('BE');
    expect(priceCountryOf({ priceCountry: 'Belgium' })).toBe('NL');
    expect(priceCountryOf(undefined)).toBe('NL');
  });

  it('swaps only the built-in articles and keeps imported and added resources', () => {
    const current = useAppStore.getState().resourceLibrary;
    const india = withBuiltInLibrary(current, 'IN');
    expect(india).toEqual([imported, fromCatalogue]);
    const back = withBuiltInLibrary(india, 'NL');
    expect(back).toHaveLength(100);
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
    expect(s.resourceLibrary).toEqual([imported, fromCatalogue]);
    expect(s.documents[0].isModified).toBe(true);
    expect(s.undoStack).toHaveLength(1);

    s.undo();
    s = useAppStore.getState();
    expect(priceCountryOf(s.schedule)).toBe('NL');
    expect(s.resourceLibrary).toHaveLength(100);

    s.redo();
    expect(useAppStore.getState().schedule.priceCountry).toBe('IN');
    expect(useAppStore.getState().resourceLibrary).toHaveLength(2);
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
    expect(useAppStore.getState().resourceLibrary).toEqual([imported, fromCatalogue]);
    useAppStore.getState().setActiveDocument('doc');
    expect(useAppStore.getState().resourceLibrary).toHaveLength(100);
    useAppStore.getState().setActiveDocument('india');
    expect(useAppStore.getState().resourceLibrary).toHaveLength(2);
  });

  it('MCP openProject never brings Dutch articles saved in the file into another country', async () => {
    const nlArticle = builtInLibraryItems('NL')[0];
    const project = JSON.parse(serializeProject({ ...createDefaultSchedule(), priceCountry: 'BE' }, []));
    project.resourceLibrary = [nlArticle, imported];
    await executeDesktopCommand('openProject', { json: JSON.stringify(project), fileName: 'be.ifcCalc' });
    expect(useAppStore.getState().resourceLibrary).toEqual([imported]);
  });

  it('is saved in the project file; old files without a country stay NL', () => {
    const saved = deserializeProject(serializeProject({ ...createDefaultSchedule(), priceCountry: 'BE' }, []));
    expect(saved.schedule.priceCountry).toBe('BE');
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
    expect(container.querySelectorAll('.resource-picker-row')).toHaveLength(100);

    await act(async () => {
      select.value = 'IN';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(useAppStore.getState().schedule.priceCountry).toBe('IN');
    expect(container.querySelector('[role="status"]')?.textContent).toContain('There is no price library for this country yet (India)');
    expect(container.querySelectorAll('.resource-picker-row')).toHaveLength(2);
  });
});
