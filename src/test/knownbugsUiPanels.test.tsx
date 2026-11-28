import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PropertiesPanel } from '@/components/panels/PropertiesPanel';
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

let node: HTMLDivElement, root: Root;

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18next.changeLanguage('en');
  useAppStore.setState({
    items: [mkItem({ id: 'a', description: 'Metselwerk', notes: '' })],
    activeItemId: 'a', activeRow: 0, undoStack: [], redoStack: [],
  });
  node = document.createElement('div'); document.body.append(node); root = createRoot(node);
  await act(async () => root.render(<PropertiesPanel />));
});
afterEach(async () => { await act(async () => root.unmount()); node.remove(); });

const textarea = () => node.querySelector<HTMLTextAreaElement>('textarea.prop-textarea')!;
const type = (value: string) => act(async () => {
  const el = textarea();
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
});
const focus = () => act(async () => { textarea().dispatchEvent(new FocusEvent('focusin', { bubbles: true })); });

describe('knownbug 45: notities in Eigenschappen zijn ongedaan te maken', () => {
  it('legt één undo-stap vast per bewerking, en Ctrl+Z zet de oude notitie terug', async () => {
    await focus();
    await type('E');
    await type('Eerste');
    expect(useAppStore.getState().items[0].notes).toBe('Eerste');
    expect(useAppStore.getState().undoStack).toHaveLength(1);

    const s = useAppStore.getState();
    const restored = s.undo();
    expect(restored?.[0].notes).toBe('');
  });

  it('een nieuwe focus geeft een nieuwe stap', async () => {
    await focus();
    await type('A');
    await focus();
    await type('AB');
    expect(useAppStore.getState().undoStack).toHaveLength(2);
    expect(useAppStore.getState().undoStack[1].items[0].notes).toBe('A');
  });
});
