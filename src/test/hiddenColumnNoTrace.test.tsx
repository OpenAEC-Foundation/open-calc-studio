// Issue #98: een verborgen kolom laat niets achter, zoals in Excel. Geen
// oranje herstelstreepje in de kop, de kopcel en de cellen eronder zijn 0 px
// zonder opvulling of rand, en doortypen op een verborgen kolom opent geen
// onzichtbare editor. Terughalen gaat via het kolomkopmenu ("Alle kolommen
// tonen") of, voor Hoeveelheid, de lintknop.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CostGrid } from '@/components/grid/CostGrid';
import { getColumnsForView, isCellEditable } from '@/components/grid/gridConstants';
import { useAppStore } from '@/state/appStore';
import type { CostItem } from '@/types/costModel';
import i18next from '@/i18n/config';

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

const columns = getColumnsForView('st', false);
const colOf = (key: string) => columns.findIndex((c) => c.key === key);

let node: HTMLDivElement, root: Root;
const s = () => useAppStore.getState();

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18next.changeLanguage('en');
  useAppStore.setState({
    gridView: 'st',
    viewportHeight: 600,
    scrollTop: 0,
    showHoeveelheid: true,
    hiddenColumns: {},
    isEditing: false,
    schedule: { ...s().schedule, branchesEnabled: false },
    items: [
      mkItem({ id: 'h1', rowType: 'chapter', description: 'Chapter', sortOrder: 0 }),
      mkItem({ id: 'a', parentId: 'h1', depth: 1, description: 'Beton', quantity: 7, sortOrder: 0 }),
    ],
  } as never);
  node = document.createElement('div'); document.body.append(node); root = createRoot(node);
  await act(async () => root.render(<CostGrid />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  node.remove();
  document.body.innerHTML = '';
});

const headerCells = () => [...node.querySelectorAll<HTMLElement>('.grid-header-cell')];

describe('issue #98: a hidden column leaves no trace', () => {
  for (const [how, hide] of [
    ['ribbon Quantity button', () => s().toggleHoeveelheid()],
    ['column header menu', () => s().setColumnHidden('st', 'hoeveelheid', true)],
  ] as const) {
    it(`hidden via the ${how}: no restore strip, the header cell is 0 px without padding or border`, async () => {
      await act(async () => hide());
      expect(node.querySelector('.grid-header-hidden-indicator')).toBeNull();
      expect(node.querySelector('.grid-header-cell button')).toBeNull();
      const cell = headerCells()[colOf('hoeveelheid')];
      expect(cell.style.width).toBe('0px');
      expect(cell.style.padding).toBe('0px');
      expect(cell.style.borderRightWidth).toBe('0px');
    });
  }

  it('also no strip when several neighbouring columns are hidden', async () => {
    await act(async () => {
      s().setColumnHidden('st', 'quantity', true);
      s().setColumnHidden('st', 'unit', true);
    });
    expect(node.querySelector('.grid-header-hidden-indicator')).toBeNull();
  });

  it('typing on a column that was hidden under the cursor does not open an invisible editor', async () => {
    const col = colOf('quantity');
    expect(isCellEditable('quantity', 'regel', 'st')).toBe(true);
    await act(async () => s().setActiveCell(1, col));
    await act(async () => s().setColumnHidden('st', 'quantity', true));
    const grid = node.querySelector<HTMLElement>('.cost-grid')!;
    await act(async () => { grid.dispatchEvent(new KeyboardEvent('keydown', { key: '5', bubbles: true, cancelable: true })); });
    expect(s().isEditing).toBe(false);
    expect(node.querySelector('.grid-cell-editor')).toBeNull();
  });

  it('"Show all columns" brings back columns hidden via the menu and via the ribbon', async () => {
    await act(async () => {
      s().toggleHoeveelheid();
      s().setColumnHidden('st', 'quantity', true);
    });
    const desc = headerCells()[colOf('description')];
    await act(async () => { desc.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 })); });
    const showAll = [...node.querySelectorAll<HTMLButtonElement>('.column-header-menu button')]
      .find((b) => b.textContent === i18next.t('grid:columnMenu.showAll'))!;
    expect(showAll.disabled).toBe(false);
    await act(async () => showAll.click());
    expect(s().showHoeveelheid).toBe(true);
    expect(s().hiddenColumns).toEqual({});
    expect(headerCells()[colOf('hoeveelheid')].style.width).not.toBe('0px');
    expect(headerCells()[colOf('quantity')].style.width).not.toBe('0px');
  });
});
