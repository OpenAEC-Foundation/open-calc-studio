import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import i18next from '@/i18n/config';
import { MobileWorkspace } from '@/components/mobile/MobileWorkspace';
import { restoreMobileDraft, saveMobileDraft } from '@/components/mobile/mobileDraft';
import { useAppStore } from '@/state/appStore';
import { createDefaultItems } from '@/data/defaultBudget';

function buttonByText(container: HTMLElement, text: string): HTMLButtonElement {
  const button = [...container.querySelectorAll('button')].find((candidate) => candidate.textContent?.trim() === text);
  if (!button) throw new Error(`Button not found: ${text}`);
  return button;
}

describe('mobile estimate workspace', () => {
  it.each([0, 5])('shows the contract amount excluding VAT with rounding %s', async (rounding) => {
    await i18next.changeLanguage('nl');
    useAppStore.setState({ documents: [], activeDocumentId: '', items: [], subSheets: [] });
    useAppStore.getState().addDocument({ fileName: 'Btw-test', items: createDefaultItems() });
    for (const item of useAppStore.getState().items) {
      if (item.rowType.startsWith('staart_')) {
        useAppStore.getState().updateItem(item.id, 'staartPercentage', item.rowType === 'staart_btw' ? 21 : 0);
      }
    }
    const chapterId = useAppStore.getState().addChapter(null);
    const postId = useAppStore.getState().addItem(chapterId);
    useAppStore.getState().updateItem(postId, 'quantity', 1);
    useAppStore.getState().updateItem(postId, 'normUnitPrice', 100);
    const roundingId = useAppStore.getState().items.find((item) => item.rowType === 'staart_afronding')!.id;
    useAppStore.getState().updateItem(roundingId, 'staartVastBedrag', rounding);
    expect(useAppStore.getState().items.find((item) => item.rowType === 'staart_btw')?.total).toBeCloseTo((100 + rounding) * 0.21, 2);
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () => { root.render(<MobileWorkspace />); });
      expect(host.querySelector('.mobile-summary')?.textContent).toContain('excl. btw');
      expect(host.querySelector('.mobile-summary strong')?.textContent).toBe(`€ ${100 + rounding},00`);
    } finally {
      await act(async () => { root.unmount(); });
      host.remove();
    }
  });

  it('loads the target cell when switching sheets and documents', async () => {
    await i18next.changeLanguage('nl');
    useAppStore.setState({ documents: [], activeDocumentId: '', items: [], subSheets: [] });
    useAppStore.getState().addDocument({ fileName: 'Eerste' });
    const firstDocument = useAppStore.getState().activeDocumentId;
    const firstSheet = useAppStore.getState().addSubSheet('Eerste blad');
    useAppStore.getState().setSubSheetCell(firstSheet, 'A1', '123');
    const secondSheet = useAppStore.getState().addSubSheet('Tweede blad');
    useAppStore.getState().setSubSheetCell(secondSheet, 'A1', '456');
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () => { root.render(<MobileWorkspace />); });
      await act(async () => { buttonByText(host, 'Bladen').click(); });
      const value = () => host.querySelectorAll<HTMLInputElement>('.mobile-cell-form input')[1].value;
      expect(value()).toBe('456');
      await act(async () => { buttonByText(host, 'Eerste blad').click(); });
      expect(value()).toBe('123');
      await act(async () => { buttonByText(host, '+ Nieuw blad').click(); });
      expect(value()).toBe('');
      await act(async () => { useAppStore.getState().addDocument({ fileName: 'Tweede' }); });
      await act(async () => { useAppStore.getState().addSubSheet('Ander document'); });
      expect(value()).toBe('');
      await act(async () => { useAppStore.getState().setActiveDocument(firstDocument); });
      await act(async () => { buttonByText(host, 'Eerste blad').click(); });
      expect(value()).toBe('123');
    } finally {
      await act(async () => { root.unmount(); });
      host.remove();
    }
  });

  it('creates a chapter, post and calculation rule through touch-size controls', async () => {
    await i18next.changeLanguage('nl');
    useAppStore.setState({ documents: [], activeDocumentId: '', items: [], subSheets: [] });
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () => { root.render(<MobileWorkspace />); });
      await act(async () => { buttonByText(host, 'Nieuw').click(); });
      expect(useAppStore.getState().documents).toHaveLength(1);
      await act(async () => { buttonByText(host, '+ Toevoegen').click(); });
      await act(async () => { buttonByText(host, 'Hoofdstuk').click(); });
      expect(useAppStore.getState().items.some((item) => item.rowType === 'chapter')).toBe(true);
      await act(async () => { buttonByText(host, '×').click(); });
      await act(async () => { buttonByText(host, '+ Toevoegen').click(); });
      await act(async () => { buttonByText(host, 'Begrotingspost').click(); });
      expect(useAppStore.getState().items.some((item) => item.rowType === 'begrotingspost')).toBe(true);
      await act(async () => { buttonByText(host, '×').click(); });
      await act(async () => { buttonByText(host, '+ Toevoegen').click(); });
      await act(async () => { buttonByText(host, 'Rekenregel').click(); });
      const rule = useAppStore.getState().items.find((item) => item.rowType === 'regel');
      expect(rule).toBeDefined();
      expect(rule?.parentId).toBe(useAppStore.getState().items.find((item) => item.rowType === 'begrotingspost')?.id);
    } finally {
      await act(async () => { root.unmount(); });
      host.remove();
    }
  });

  it('restores the current estimate and spreadsheet cells from the local mobile draft', () => {
    useAppStore.setState({ documents: [], activeDocumentId: '', items: [], subSheets: [] });
    const store = useAppStore.getState();
    store.addDocument({ fileName: 'Telefoonproject', items: [] });
    const chapterId = useAppStore.getState().addChapter(null);
    useAppStore.getState().updateItem(chapterId, 'description', 'Fundering');
    const sheetId = useAppStore.getState().addSubSheet('Hoeveelheden');
    useAppStore.getState().setSubSheetCell(sheetId, 'A1', '12,5');
    expect(saveMobileDraft()).toBe(true);
    useAppStore.setState({ documents: [], activeDocumentId: '', items: [], subSheets: [] });
    expect(restoreMobileDraft()).toBe(true);
    expect(useAppStore.getState().documents[0].fileName).toBe('Telefoonproject');
    expect(useAppStore.getState().items.some((item) => item.description === 'Fundering')).toBe(true);
    expect(useAppStore.getState().subSheets[0].cells.A1.value).toBe('12,5');
    localStorage.removeItem('ocs-mobile-draft-v1');
  });

  it('updates quantity and unit price and recalculates a post', async () => {
    await i18next.changeLanguage('nl');
    useAppStore.setState({ documents: [], activeDocumentId: '', items: [], subSheets: [] });
    useAppStore.getState().addDocument({ fileName: 'Prijstest', items: [] });
    const chapterId = useAppStore.getState().addChapter(null);
    const postId = useAppStore.getState().addItem(chapterId);
    useAppStore.getState().updateItem(postId, 'description', 'Metselwerk');
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () => { root.render(<MobileWorkspace />); });
      const postButton = [...host.querySelectorAll<HTMLButtonElement>('.mobile-item-body')].find((button) => button.textContent?.includes('Metselwerk'));
      expect(postButton).toBeDefined();
      await act(async () => { postButton!.click(); });
      const inputs = host.querySelectorAll<HTMLInputElement>('.mobile-edit-fields input');
      const setInput = (input: HTMLInputElement, value: string) => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      };
      await act(async () => { setInput(inputs[2], '2'); setInput(inputs[3], '50'); });
      await act(async () => { buttonByText(host, 'Gereed').click(); });
      const post = useAppStore.getState().items.find((item) => item.id === postId);
      expect(post?.quantity).toBe(2);
      expect(post?.normUnitPrice).toBe(50);
      expect(post?.total).toBe(100);
    } finally {
      await act(async () => { root.unmount(); });
      host.remove();
    }
  });
});
