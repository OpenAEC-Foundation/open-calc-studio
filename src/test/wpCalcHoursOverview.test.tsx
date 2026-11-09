import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useAppStore } from '@/state/appStore';
import { changeLanguage } from '@/i18n/config';
import { UrenStaartView } from '@/components/grid/WpCalcBottomPanel';

// Issue #66 points 6 and 8 (knownbugs 15 and 9): the "Uren & Staart" hours
// overview must not rescale norms when an hours field is only focused and
// left, and must show the same labour amount as the calculator.

const initial = useAppStore.getState();
let rule: string;
let root: Root | undefined;
let node: HTMLDivElement;

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await changeLanguage('en');
  useAppStore.setState(initial, true);
  const state = useAppStore.getState();
  state.addDocument({ id: 'hours-doc', items: [] });
  const chapter = state.addChapter(null);
  const post = state.addItem(chapter);
  rule = state.addRegel(post);
  state.updateTarieven({ A: 64, B: 43, C: 82 });
  state.updateItem(rule, 'tariefGroep', 'A');
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  node?.remove();
});

async function renderView() {
  node = document.createElement('div');
  document.body.appendChild(node);
  root = createRoot(node);
  await act(async () => root!.render(<UrenStaartView />));
}

const hoursInput = () => node.querySelector<HTMLInputElement>('input.uren-input:not(.uren-input-total)')!;
const totalHoursInput = () => node.querySelector<HTMLInputElement>('input.uren-input-total')!;
const rateInput = () => node.querySelector<HTMLInputElement>('input.tarief-input')!;
const rule1 = () => useAppStore.getState().items.find(i => i.id === rule)!;

async function focusAndLeave(input: HTMLInputElement) {
  await act(async () => { input.focus(); input.blur(); });
}

describe('hours overview: leaving a field without editing changes nothing', () => {
  it('keeps 1.234,50 hours and the labour cost when the group hours field is blurred', async () => {
    const state = useAppStore.getState();
    state.updateItem(rule, 'quantity', 1234.5);
    state.updateItem(rule, 'normQuantity', 1);
    await renderView();
    expect(hoursInput().value).toBe('1.234,50');
    const before = rule1().total;
    expect(before).toBeCloseTo(79008, 2);

    await focusAndLeave(hoursInput());
    expect(rule1().normQuantity).toBe(1);
    expect(rule1().total).toBeCloseTo(79008, 2);

    await focusAndLeave(totalHoursInput());
    expect(rule1().normQuantity).toBe(1);
    expect(useAppStore.getState().undoStack).toHaveLength(0);
  });

  it('does not drift when the shown value is rounded (12,345 h shown as 12,35)', async () => {
    const state = useAppStore.getState();
    state.updateItem(rule, 'quantity', 12.345);
    state.updateItem(rule, 'normQuantity', 1);
    await renderView();
    expect(hoursInput().value).toBe('12,35');
    await focusAndLeave(hoursInput());
    expect(rule1().normQuantity).toBe(1);
  });

  it('reads a typed Dutch number with a thousands separator correctly', async () => {
    const state = useAppStore.getState();
    state.updateItem(rule, 'quantity', 1000);
    state.updateItem(rule, 'normQuantity', 1);
    await renderView();
    const input = hoursInput();
    await act(async () => {
      input.focus();
      input.value = '2.000,00';
      input.blur();
    });
    expect(rule1().normQuantity).toBeCloseTo(2, 6);
  });

  it('reads a typed rate with a decimal comma and ignores an unchanged rate field', async () => {
    useAppStore.getState().updateItem(rule, 'quantity', 1);
    useAppStore.getState().updateItem(rule, 'normQuantity', 1);
    await renderView();
    const tarieven = useAppStore.getState().schedule.tarieven;
    await focusAndLeave(rateInput());
    expect(useAppStore.getState().schedule.tarieven).toBe(tarieven);
    const input = rateInput();
    await act(async () => {
      input.focus();
      input.value = '1.250,50';
      input.blur();
    });
    expect(useAppStore.getState().schedule.tarieven?.A).toBe(1250.5);
  });
});

describe('hours overview: labour amount equals the calculator', () => {
  it('quantity 10, norm 1, capacity 2, rate 64 gives 640 in grid and overview', async () => {
    const state = useAppStore.getState();
    state.updateItem(rule, 'quantity', 10);
    state.updateItem(rule, 'normQuantity', 1);
    state.updateItem(rule, 'normFactor', 2);
    expect(rule1().total).toBeCloseTo(640, 6);
    await renderView();
    const hoursTable = node.querySelector('table.wpcalc-bottom-table')!;
    const cellsOf = (tr: Element) => [...tr.querySelectorAll('td')].map(td => td.textContent ?? '');
    const groupRow = cellsOf(hoursTable.querySelector('tbody tr')!);
    const totalRow = cellsOf(hoursTable.querySelector('tr.wpcalc-bottom-total')!);
    expect(hoursInput().value).toBe('5,00');
    expect(groupRow[3]).toBe('640,00');
    expect(totalRow[3]).toBe('640,00');
  });
});
