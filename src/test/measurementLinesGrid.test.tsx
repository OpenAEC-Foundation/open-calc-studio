// Issue #96: in UI-1 staan de meetregels als tabelletje direct onder de post.
// Een vak bewerken zet de hoeveelheid van de post; inklappen verbergt ze;
// zelf een hoeveelheid typen vraagt eerst of de regels weg mogen.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CostGrid } from '@/components/grid/CostGrid';
import { getColumnsForView } from '@/components/grid/gridConstants';
import { useAppStore } from '@/state/appStore';
import { newMeasurementLine } from '@/services/measurement/measurementLines';
import type { CostItem } from '@/types/costModel';
import i18next from '@/i18n/config';
import { useGridEditing } from '@/components/grid/useGridEditing';

function mkItem(partial: Partial<CostItem> & { id: string }): CostItem {
  return {
    parentId: null, sortOrder: 0, code: '', description: '', unit: 'st', quantity: null,
    materialPrice: null, laborPrice: null, unitPrice: 0, total: 0, isCollapsed: false, depth: 0,
    notes: '', ifcGuid: '', rowType: 'regel', staartPercentage: null, nr: '',
    normQuantity: null, normFactor: null, normDivisor: null, normUnitPrice: null,
    resourceType: null, resourceLibraryId: null, verrekenbaar: null, tariefGroep: null,
    ...partial,
  } as CostItem;
}

let node: HTMLDivElement, root: Root;
const s = () => useAppStore.getState();
const post = () => s().items.find((i) => i.id === 'p')!;

/** Typ in een invoervak zoals een gebruiker: focus, waarde, blur. */
async function type(el: HTMLInputElement, value: string) {
  await act(async () => { el.focus(); });
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => { el.blur(); });
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18next.changeLanguage('en');
  useAppStore.setState({
    gridView: 'st',
    viewportHeight: 800,
    scrollTop: 0,
    showHoeveelheid: true,
    hiddenColumns: {},
    isEditing: false,
    schedule: { ...s().schedule, branchesEnabled: false },
    items: [
      mkItem({ id: 'h1', rowType: 'chapter', description: 'Fachadas', sortOrder: 0 }),
      mkItem({
        id: 'p', parentId: 'h1', depth: 1, rowType: 'begrotingspost', description: 'Fábrica', unit: 'm²', quantity: 30, sortOrder: 0,
        measurementLines: [newMeasurementLine({ id: 'l1', description: 'Fachada norte', count: 1, length: 10, height: 3 })],
      }),
    ],
  } as never);
  node = document.createElement('div'); document.body.append(node); root = createRoot(node);
  await act(async () => root.render(<CostGrid />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  node.remove();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

const block = () => node.querySelector<HTMLElement>('[data-measurement-for="p"]');
const cell = (line: string, field: string) => node.querySelector<HTMLInputElement>(`[data-ml="p:${line}:${field}"]`)!;

describe('meetregels in het grid', () => {
  it('staan als tabelletje onder de post, met de som', () => {
    expect(block()).not.toBeNull();
    expect(cell('l1', 'description').value).toBe('Fachada norte');
    expect(block()!.querySelector('.measurement-sum')!.textContent).toBe('30.00');
  });

  it('een vak wijzigen zet de hoeveelheid van de post', async () => {
    await type(cell('l1', 'count'), '2');
    expect(post().quantity).toBe(60);
    expect(post().measurementLines![0].count).toBe(2);
  });

  it('een formule wordt bewaard naast de uitkomst', async () => {
    await type(cell('l1', 'length'), '=4*2,5');
    expect(post().measurementLines![0]).toMatchObject({ length: 10, formulas: { length: '=4*2,5' } });
  });

  it('+ Line voegt een regel toe; Esc zet een vak terug', async () => {
    const add = block()!.querySelector<HTMLButtonElement>('.measurement-add')!;
    await act(async () => { add.click(); });
    expect(post().measurementLines).toHaveLength(2);

    const el = cell('l1', 'count');
    await act(async () => { el.focus(); });
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => { setter.call(el, '9'); el.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => { el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(post().measurementLines![0].count).toBe(1);
  });

  it('inklappen van de post verbergt de regels', async () => {
    await act(async () => { s().toggleCollapse('p'); });
    expect(block()).toBeNull();
  });

  it('in UI-2 staan ze er niet', async () => {
    await act(async () => { useAppStore.setState({ gridView: 'wpcalc' } as never); });
    expect(block()).toBeNull();
  });
});

/** commitEdit uit de echte hook, via een klein component. */
async function gridEditing() {
  const ref: { commitEdit?: ReturnType<typeof useGridEditing>['commitEdit'] } = {};
  const Probe = () => { ref.commitEdit = useGridEditing().commitEdit; return null; };
  const host = document.createElement('div');
  await act(async () => createRoot(host).render(<Probe />));
  return ref;
}

describe('zelf een hoeveelheid typen', () => {
  const qtyCol = getColumnsForView('st', false).findIndex((c) => c.key === 'quantity');

  it('vraagt eerst; nee laat alles staan, ja haalt de regels weg', async () => {
    const ed = await gridEditing();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await act(async () => { ed.commitEdit!(post(), qtyCol, '50'); });
    expect(confirm).toHaveBeenCalledOnce();
    expect(post().quantity).toBe(30);
    expect(post().measurementLines).toHaveLength(1);

    confirm.mockReturnValue(true);
    await act(async () => { ed.commitEdit!(post(), qtyCol, '50'); });
    expect(post().quantity).toBe(50);
    expect(post().measurementLines).toBeUndefined();
  });

  it('dezelfde hoeveelheid typen vraagt niets', async () => {
    const ed = await gridEditing();
    const confirm = vi.spyOn(window, 'confirm');
    await act(async () => { ed.commitEdit!(post(), qtyCol, '30'); });
    expect(confirm).not.toHaveBeenCalled();
    expect(post().measurementLines).toHaveLength(1);
  });
});
