import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { changeLanguage } from '@/i18n/config';
import { ResourcePicker } from '@/components/library/ResourcePicker';
import CostItemPicker from '@/components/common/CostItemPicker';
import { useAppStore } from '@/state/appStore';
import { createDefaultSchedule } from '@/data/defaultBudget';
import type { CostItem, ResourceLibraryItem } from '@/types/costModel';

const brick: ResourceLibraryItem = { id: 'r1', code: 'M.001', description: 'Baksteen rood', unit: 'st', resourceType: 'materiaal', defaultUnitPrice: 1, category: 'Metselwerk' };
const sand: ResourceLibraryItem = { id: 'r2', code: 'M.002', description: 'Zand', unit: 'm³', resourceType: 'materiaal', defaultUnitPrice: 30, category: 'Grondwerk' };
const item = (id: string, description: string): CostItem => ({
  id, parentId: null, sortOrder: 0, code: '', description, unit: 'st', quantity: null, materialPrice: null, laborPrice: null, unitPrice: 0, total: 0,
  isCollapsed: false, depth: 0, notes: '', ifcGuid: '', rowType: 'chapter', staartPercentage: null, nr: '', normQuantity: null, normFactor: null,
  normDivisor: null, normUnitPrice: null, resourceType: null, resourceLibraryId: null, verrekenbaar: null, tariefGroep: null,
} as CostItem);

let container: HTMLDivElement, root: Root;
beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await changeLanguage('en');
  Element.prototype.scrollIntoView = vi.fn();
  useAppStore.setState({
    schedule: createDefaultSchedule(), items: [item('a', 'Metselwerk'), item('b', 'Grondwerk')],
    documents: [{ id: 'doc', fileName: 'a', filePath: null, isModified: false, items: [], schedule: createDefaultSchedule() } as never], activeDocumentId: 'doc',
    resourceLibrary: [brick, sand], resourcePickerOpen: false,
  });
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

async function type(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('knownbug 195: zoeken met spaties eromheen', () => {
  it('ResourcePicker negeert spaties vooraan en achteraan', async () => {
    useAppStore.setState({ resourcePickerOpen: true });
    await act(async () => root.render(<ResourcePicker />));
    await type(container.querySelector<HTMLInputElement>('.resource-picker-search input')!, ' baksteen ');
    const rows = [...container.querySelectorAll('.resource-picker-row')].map(r => r.textContent ?? '');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain('Baksteen rood');
  });

  it('CostItemPicker negeert spaties vooraan en achteraan', async () => {
    await act(async () => root.render(<CostItemPicker open offerteOnderdeel="" offerteOmschrijving="" linkedChapterId={null} currentLinkedId={null} onSelect={() => {}} onUnlink={() => {}} onCancel={() => {}} />));
    await type(container.querySelector<HTMLInputElement>('.cost-picker-search input')!, 'metselwerk ');
    expect(container.textContent).toContain('Metselwerk');
    expect(container.textContent).not.toContain('Grondwerk');
  });
});
