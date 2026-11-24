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

  it('Parcial per regel, Subtotal alleen op een tussentotaalregel; aantal zonder decimalen', async () => {
    await act(async () => {
      s().setMeasurementLines('p', [
        newMeasurementLine({ id: 'l1', description: 'Norte', count: 1, length: 10, height: 3 }),
        newMeasurementLine({ id: 'l2', description: 'Sur', count: 1, length: 10, height: 3 }),
        newMeasurementLine({ id: 'st', description: 'Fachadas', subtotal: 'partial' }),
        newMeasurementLine({ id: 'l3', description: 'Puerta', count: -1, length: 0.9, height: 2.1 }),
      ]);
    });
    const values = (id: string) => [...cell(id, 'description').closest('.measurement-row')!.querySelectorAll('.measurement-value')].map((e) => e.textContent);
    expect(values('l1')).toEqual(['30.00', '']);
    expect(values('st')).toEqual(['', '60.00']);
    expect(values('l3')).toEqual(['-1.89', '']);
    expect(cell('l1', 'count').value).toBe('1');
    expect(block()!.querySelector('.measurement-sum')!.textContent).toBe('58.11');
  });

  it('Ctrl+Z in een vak legt het vak vast en draait het dan terug', async () => {
    const el = cell('l1', 'count');
    await act(async () => { el.focus(); });
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => { setter.call(el, '3'); el.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => { el.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true })); });
    expect(post().measurementLines![0].count).toBe(1);
    expect(post().quantity).toBe(30);
  });

  it('toetsen met Ctrl uit een meetregel bereiken de grid niet (Ctrl+Delete wiste de hoeveelheid)', async () => {
    const qtyCol = getColumnsForView('st', false).findIndex((c) => c.key === 'quantity');
    await act(async () => { s().setActiveCell(1, qtyCol, 'p'); });
    const copy = vi.spyOn(s(), 'copyItems');
    const el = cell('l1', 'description');
    await act(async () => { el.focus(); });
    for (const key of ['Delete', 'c', 'ArrowRight', 'Home']) {
      await act(async () => { el.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true })); });
    }
    expect(post().quantity).toBe(30);
    expect(post().measurementLines).toHaveLength(1);
    expect(s().activeCol).toBe(qtyCol);
    expect(s().isEditing).toBe(false);
    expect(copy).not.toHaveBeenCalled();
  });

  it('Ctrl+Shift+Z in een vak doet opnieuw', async () => {
    await type(cell('l1', 'count'), '2');
    expect(post().quantity).toBe(60);
    await act(async () => { s().setItems(s().undo()!); });
    expect(post().quantity).toBe(30);
    const el = cell('l1', 'count');
    await act(async () => { el.focus(); });
    await act(async () => { el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Z', ctrlKey: true, shiftKey: true, bubbles: true })); });
    expect(post().quantity).toBe(60);
  });

  it('Delete op de hoeveelheid van een post met meetregels vraagt eerst', async () => {
    const qtyCol = getColumnsForView('st', false).findIndex((c) => c.key === 'quantity');
    await act(async () => { s().setActiveCell(1, qtyCol, 'p'); });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const grid = node.querySelector<HTMLElement>('.cost-grid')!;
    await act(async () => { grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true })); });
    expect(confirm).toHaveBeenCalledOnce();
    expect(post().quantity).toBe(30);
    expect(post().measurementLines).toHaveLength(1);
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
    // The new line gets focus one frame later. Wait for it, otherwise that focus
    // can land between typing and Esc on a slow machine and save the typed value.
    await act(async () => { await new Promise((r) => requestAnimationFrame(() => r(undefined))); });
    const added = post().measurementLines![1].id;
    expect(document.activeElement).toBe(cell(added, 'description'));

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

  it('staan ook in UI-2 en Eenvoudig onder de post', async () => {
    for (const view of ['wpcalc', 'simple']) {
      await act(async () => { useAppStore.setState({ gridView: view } as never); });
      expect(block(), view).not.toBeNull();
      expect(cell('l1', 'description').value).toBe('Fachada norte');
    }
  });

  it('hoeveelheid ≠ som: waarschuwing, en één klik neemt de som over', async () => {
    expect(block()!.querySelector('.measurement-mismatch')).toBeNull();
    await act(async () => {
      useAppStore.setState({ items: s().items.map((i) => (i.id === 'p' ? { ...i, quantity: 31 } : i)) } as never);
    });
    const warn = block()!.querySelector<HTMLButtonElement>('.measurement-mismatch')!;
    expect(warn.textContent).toContain('31.00 ≠ 30.00');
    expect(warn.title).toContain('31.00');
    expect(warn.title).toContain('30.00');
    await act(async () => { warn.click(); });
    expect(post().quantity).toBe(30);
    expect(post().measurementLines).toHaveLength(1);
    expect(block()!.querySelector('.measurement-mismatch')).toBeNull();
  });

  it('eigen chevron klapt alleen de meetregels in; de middelen blijven staan', async () => {
    await act(async () => {
      useAppStore.setState({
        items: [...s().items, mkItem({ id: 'r', parentId: 'p', depth: 2, description: 'Ladrillo', quantity: 30, sortOrder: 0 })],
      } as never);
    });
    const toggle = () => block()!.querySelector<HTMLButtonElement>('.measurement-toggle')!;
    expect(toggle().getAttribute('aria-expanded')).toBe('true');

    await act(async () => { toggle().click(); });
    expect(post().measurementLinesCollapsed).toBe(true);
    expect(post().isCollapsed).toBe(false);
    expect(node.querySelector('[data-ml="p:l1:description"]')).toBeNull();
    expect(block()!.querySelector('.measurement-summary')!.textContent).toContain('Measurement lines: 1');
    expect(block()!.querySelector('.measurement-sum')!.textContent).toBe('30.00');
    expect(node.textContent).toContain('Ladrillo');

    await act(async () => { toggle().click(); });
    expect(post().measurementLinesCollapsed).toBe(false);
    expect(cell('l1', 'description').value).toBe('Fachada norte');
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

/** Plak tekst in een vak zoals vanuit Excel: een paste-event met clipboardData. */
async function paste(el: HTMLInputElement, text: string): Promise<Event> {
  await act(async () => { el.focus(); });
  const Ctor = typeof ClipboardEvent === 'function' ? ClipboardEvent : Event;
  const ev = new Ctor('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'clipboardData', { value: { getData: (type: string) => (type === 'text/plain' ? text : '') } });
  await act(async () => { el.dispatchEvent(ev); });
  return ev;
}

const rows = () => post().measurementLines!.map((l) => [l.description, l.count, l.length, l.width, l.height]);

describe('meetregels plakken uit Excel', () => {
  beforeEach(async () => { await act(async () => { await i18next.changeLanguage('nl'); }); });

  it('een blok van 3×5 vanaf Omschrijving wordt drie regels; de hoeveelheid volgt de som', async () => {
    const ev = await paste(cell('l1', 'description'), 'Noord\t2\t10\t\t3\r\nZuid\t1\t8,5\t\t3\r\nSparing\t-1\t2\t\t1,2\r\n');
    expect(ev.defaultPrevented).toBe(true);
    expect(rows()).toEqual([
      ['Noord', 2, 10, null, 3],
      ['Zuid', 1, 8.5, null, 3],
      ['Sparing', -1, 2, null, 1.2],
    ]);
    expect(post().measurementLines![0].id).toBe('l1');
    expect(post().quantity).toBe(83.1);
  });

  it('vanaf Aantal begint het blok bij Aantal; andere vakken van de regel blijven staan', async () => {
    const el = cell('l1', 'count');
    // Half getypt in het vak: het plakken wint, het vak schrijft bij verlaten niets terug.
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => { el.focus(); setter.call(el, '99'); el.dispatchEvent(new Event('input', { bubbles: true })); });
    const undoBefore = s().undoStack.length;
    await paste(el, '4\t5\n6\t7');
    // Precies één undo-stap, het plakken: het vak heeft zijn "99" niet eerst vastgelegd.
    expect(s().undoStack.length).toBe(undoBefore + 1);
    expect(s().undoStack[s().undoStack.length - 1].description).toBe(i18next.t('grid:measurement.pasteUndo'));
    // Daarna staat de focus weer in het startvak, met de geplakte waarde.
    await act(async () => { await new Promise((r) => requestAnimationFrame(() => r(null))); });
    expect(document.activeElement).toBe(cell('l1', 'count'));
    expect(cell('l1', 'count').value).toBe('4');
    await act(async () => { cell('l1', 'count').blur(); });
    expect(s().undoStack.length).toBe(undoBefore + 1);
    expect(rows()).toEqual([
      ['Fachada norte', 4, 5, null, 3],
      ['', 6, 7, null, null],
    ]);
    expect(post().quantity).toBe(102);
  });

  it('overschrijft regels vanaf de cursor en vult aan', async () => {
    await act(async () => {
      s().setMeasurementLines('p', [
        newMeasurementLine({ id: 'l1', description: 'A', count: 1 }),
        newMeasurementLine({ id: 'l2', description: 'B', count: 1 }),
      ]);
    });
    await paste(cell('l2', 'description'), 'B2\t2\nC\t3\nD\t4');
    expect(rows()).toEqual([
      ['A', 1, null, null, null],
      ['B2', 2, null, null, null],
      ['C', 3, null, null, null],
      ['D', 4, null, null, null],
    ]);
    expect(post().measurementLines!.slice(0, 2).map((l) => l.id)).toEqual(['l1', 'l2']);
    expect(post().quantity).toBe(10);
  });

  it('leest komma-decimalen en duizendtallen; een formule blijft formule', async () => {
    await paste(cell('l1', 'count'), '1\t1.234,5\t2,5\t=2*1,5');
    expect(rows()[0]).toEqual(['Fachada norte', 1, 1234.5, 2.5, 3]);
    expect(post().measurementLines![0].formulas).toEqual({ height: '=2*1,5' });
  });

  it('een ongeldige cel blijft leeg, de rest wordt geplakt; een melding in het tabelletje noemt de regels', async () => {
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
    await paste(cell('l1', 'description'), 'A\tveel\t2\nB\t3\t4 m\nC\t1\t€ 5\t\t\t9');
    expect(rows()).toEqual([
      ['A', null, 2, null, 3],
      ['B', 3, 4, null, null],
      ['C', 1, null, null, null],
    ]);
    expect(alert).not.toHaveBeenCalled();
    const notice = () => block()!.querySelector<HTMLElement>('.measurement-notice');
    expect(notice()!.textContent).toContain('regels 1, 3');
    expect(notice()!.textContent).toContain('Eenheid weggelaten: regels 2');
    expect(notice()!.textContent).toContain('Kolommen na Hoogte');
    await act(async () => { notice()!.querySelector<HTMLButtonElement>('button')!.click(); });
    expect(notice()).toBeNull();
  });

  it('Ctrl+Z na plakken haalt ook de melding weg', async () => {
    await paste(cell('l1', 'count'), 'veel\t2\n3\t4');
    expect(block()!.querySelector('.measurement-notice')).not.toBeNull();
    await act(async () => { s().setItems(s().undo()!); });
    expect(rows()).toEqual([['Fachada norte', 1, 10, null, 3]]);
    expect(block()!.querySelector('.measurement-notice')).toBeNull();
  });

  it('plakken op een tussentotaal begint op de regel erna, en daar staat dan de focus', async () => {
    await act(async () => {
      s().setMeasurementLines('p', [
        newMeasurementLine({ id: 's', subtotal: 'partial' }),
        newMeasurementLine({ id: 'l2', description: 'B', count: 1 }),
      ]);
    });
    await paste(cell('s', 'description'), 'X\t2\nY\t3');
    expect(post().measurementLines!.map((l) => [l.id === 's' ? 's' : l.description, l.count])).toEqual([['s', null], ['X', 2], ['Y', 3]]);
    await act(async () => { await new Promise((r) => requestAnimationFrame(() => r(null))); });
    expect(document.activeElement).toBe(cell('l2', 'description'));
  });

  it('de melding verdwijnt bij de volgende wijziging; de undo-stap heet plakken', async () => {
    await paste(cell('l1', 'count'), 'veel\t2\n3\t4');
    expect(s().undoStack[s().undoStack.length - 1]?.description).toBe(i18next.t('grid:measurement.pasteUndo'));
    expect(block()!.querySelector('.measurement-notice')).not.toBeNull();
    await type(cell('l1', 'count'), '5');
    expect(block()!.querySelector('.measurement-notice')).toBeNull();
  });

  it('decimalen volgen het blok: "1,250" naast "2,5" is 1,25, ook met de app in het Engels', async () => {
    await act(async () => { await i18next.changeLanguage('en'); });
    await paste(cell('l1', 'count'), '1\t1,250\t2,5');
    expect(rows()[0]).toEqual(['Fachada norte', 1, 1.25, 2.5, 3]);
    expect(block()!.querySelector('.measurement-notice')).toBeNull();
  });

  it('het hele plakken is één undo-stap', async () => {
    await paste(cell('l1', 'description'), 'A\t2\nB\t3\nC\t4');
    expect(post().measurementLines).toHaveLength(3);
    await act(async () => { s().setItems(s().undo()!); });
    expect(rows()).toEqual([['Fachada norte', 1, 10, null, 3]]);
    expect(post().quantity).toBe(30);
  });

  it('één waarde plakt de browser gewoon in het vak (ook met het regeleinde van één Excel-cel)', async () => {
    for (const text of ['7', '7\r\n']) {
      const ev = await paste(cell('l1', 'count'), text);
      expect(ev.defaultPrevented).toBe(false);
    }
    expect(rows()).toEqual([['Fachada norte', 1, 10, null, 3]]);
  });

  it('plakken bereikt de grid niet', async () => {
    const seen = vi.fn();
    document.addEventListener('paste', seen);
    try {
      await paste(cell('l1', 'count'), '7');
      await paste(cell('l1', 'count'), '7\t8');
    } finally {
      document.removeEventListener('paste', seen);
    }
    expect(seen).not.toHaveBeenCalled();
  });

  it('een gekoppelde hoeveelheid vraagt eerst; nee laat alles staan', async () => {
    useAppStore.setState({
      items: s().items.map((i) => (i.id === 'p' ? { ...i, excelLink: { filePath: 'x.xlsx', sheet: 'Blad1', cell: 'A1' } as never } : i)),
    } as never);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await paste(cell('l1', 'description'), 'A\t2\nB\t3');
    expect(confirm).toHaveBeenCalledOnce();
    expect(rows()).toEqual([['Fachada norte', 1, 10, null, 3]]);
    // Annuleren: terug in het vak.
    await act(async () => { await new Promise((r) => requestAnimationFrame(() => r(null))); });
    expect(document.activeElement).toBe(cell('l1', 'description'));
    expect(post().excelLink).toBeTruthy();
    confirm.mockReturnValue(true);
    await paste(cell('l1', 'description'), 'A\t2\nB\t3');
    expect(rows()).toEqual([['A', 2, 10, null, 3], ['B', 3, null, null, null]]);
    expect(post().excelLink).toBeFalsy();
  });
});
