import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { CalculationWizard } from '@/components/wizard/CalculationWizard';
import { useAppStore } from '@/state/appStore';
import type { CostItem } from '@/types/costModel';
import i18next from '@/i18n/config';

const mk = (id: string, rowType: CostItem['rowType'], extra: Partial<CostItem> = {}): CostItem => ({
  id, parentId: null, sortOrder: 0, code: '', description: id, unit: 'st', quantity: null, materialPrice: null, laborPrice: null, unitPrice: 0, total: 0,
  isCollapsed: false, depth: 0, notes: '', ifcGuid: '', rowType, staartPercentage: null, nr: '', normQuantity: null, normFactor: null,
  normDivisor: null, normUnitPrice: null, resourceType: null, resourceLibraryId: null, verrekenbaar: null, tariefGroep: null, ...extra,
} as CostItem);

it('knownbug 193: het totaal excl. btw van de wizard telt de opslagen oude stijl (ukk/ak/wr) mee', async () => {
  await i18next.changeLanguage('en');
  useAppStore.setState({ documents: [], activeDocumentId: '', items: [] });
  useAppStore.getState().addDocument({ fileName: 'BasCalc', items: [
    mk('h1', 'chapter', { sortOrder: 0 }),
    mk('p1', 'begrotingspost', { parentId: 'h1', depth: 1, quantity: 1, normUnitPrice: 1000 }),
    mk('ukk', 'staart_ukk', { sortOrder: 1, staartPercentage: 10 }),
    mk('ak', 'staart_ak', { sortOrder: 2, staartPercentage: 5 }),
  ] });
  useAppStore.getState().updateItem('p1', 'normUnitPrice', 1000);
  const items = useAppStore.getState().items;
  const ukk = items.find(i => i.id === 'ukk')!.total, ak = items.find(i => i.id === 'ak')!.total;
  expect(ukk).toBeGreaterThan(0);
  const container = document.createElement('div'); document.body.append(container); const root = createRoot(container);
  try {
    await act(async () => { root.render(<CalculationWizard />); });
    const shown = container.querySelector('output[aria-live="polite"] strong')?.textContent ?? '';
    const amount = Number(shown.replace(/[^\d.-]/g, ''));
    expect(amount).toBeCloseTo(1000 + ukk + ak, 2);
  } finally { await act(async () => root.unmount()); container.remove(); }
});
