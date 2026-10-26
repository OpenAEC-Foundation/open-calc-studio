import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { CalculationWizard, parseWizardNumber } from '@/components/wizard/CalculationWizard';
import { useAppStore } from '@/state/appStore';
import { createDefaultItems } from '@/data/defaultBudget';
import { getStaartBreakdown } from '@/services/calculation/calculator';
import { serializeProject, deserializeProject } from '@/services/file/fileService';
import i18next from '@/i18n/config';

it('keeps wizard navigation and exported calculations on the editor model', async () => {
  await i18next.changeLanguage('nl');
  useAppStore.setState({ documents: [], activeDocumentId: '', items: [] });
  const state = useAppStore.getState(); state.addDocument({ fileName: 'Wizard parity', items: createDefaultItems() });
  const chapter = state.addChapter(null); const post = state.addItem(chapter);
  state.updateItem(post, 'quantity', 3); state.updateItem(post, 'normUnitPrice', 25);
  const expected = getStaartBreakdown(useAppStore.getState().items).aanneemsomExcl;
  const container = document.createElement('div'); document.body.append(container); const root = createRoot(container);
  try {
    await act(async () => { root.render(<CalculationWizard />); });
    for (let i = 0; i < 4; i++) await act(async () => { [...container.querySelectorAll('button')].find(b => b.textContent === 'Volgende')!.click(); });
    expect(container.querySelector('table')?.textContent).toContain('75');
    expect(getStaartBreakdown(useAppStore.getState().items).aanneemsomExcl).toBe(expected);
    await act(async () => { [...container.querySelectorAll('button')].find(b => b.textContent === 'Volledige editor openen')!.click(); });
    const current = useAppStore.getState(); expect(current.activeContentTab).toBe('grid');
    const roundtrip = deserializeProject(serializeProject(current.schedule, current.items));
    expect(getStaartBreakdown(roundtrip.items).aanneemsomExcl).toBeCloseTo(expected, 8);
  } finally { await act(async () => root.unmount()); container.remove(); }
});
it('validates whole decimal-comma and decimal-point numbers instead of silently rounding', () => {
  expect(parseWizardNumber('1.234,50', true)).toBe(1234.5);
  expect(parseWizardNumber('1.5', true)).toBeUndefined();
  expect(parseWizardNumber('1,', true)).toBeUndefined();
  expect(parseWizardNumber('1,234.50', false)).toBe(1234.5);
  expect(parseWizardNumber('3oops', false)).toBeUndefined();
});
