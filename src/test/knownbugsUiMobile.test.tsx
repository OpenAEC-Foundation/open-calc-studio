import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import i18next from '@/i18n/config';
import { MobileWorkspace } from '@/components/mobile/MobileWorkspace';
import { formatInputNumber, parseLocaleNumber } from '@/utils/numberInput';
import { useAppStore } from '@/state/appStore';

function buttonByText(container: HTMLElement, text: string): HTMLButtonElement {
  const button = [...container.querySelectorAll('button')].find((candidate) => candidate.textContent?.trim() === text);
  if (!button) throw new Error(`Button not found: ${text}`);
  return button;
}

let cleanup: (() => Promise<void>) | null = null;
async function render() {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => { root.render(<MobileWorkspace />); });
  cleanup = async () => { await act(async () => { root.unmount(); }); host.remove(); };
  return host;
}
afterEach(async () => { await cleanup?.(); cleanup = null; });

function budgetWithPost(quantity: number) {
  useAppStore.setState({ documents: [], activeDocumentId: '', items: [], subSheets: [], reviewReturnItemId: null, activeContentTab: 'grid' });
  useAppStore.getState().addDocument({ fileName: 'Mobiel' });
  const chapterId = useAppStore.getState().addChapter(null);
  const postId = useAppStore.getState().addItem(chapterId);
  useAppStore.getState().updateItem(postId, 'description', 'Metselwerk');
  useAppStore.getState().updateItem(postId, 'quantity', quantity);
  return postId;
}

describe('knownbug 205: "Terug naar controle" op het tabblad Begroting', () => {
  it('gaat terug naar de controle, ook als de controle al het actieve inhoudstabblad is', async () => {
    await i18next.changeLanguage('en');
    const postId = budgetWithPost(2);
    const host = await render();
    // Vanuit de controle een post geopend, daarna via de navigatie naar
    // Controle en weer naar Begroting: activeContentTab blijft 'review'.
    await act(async () => { useAppStore.setState({ reviewReturnItemId: postId, activeContentTab: 'review' }); });
    await act(async () => { buttonByText(host, 'Estimate').click(); });
    expect(host.querySelector('.review-return-bar')).not.toBeNull();
    await act(async () => { buttonByText(host, 'Back to review center').click(); });
    const current = host.querySelector('.mobile-nav [aria-current="page"]');
    expect(current?.textContent).toContain('Review');
  });
});

describe('knownbug 206: valutacode in de mobiele weergave', () => {
  it('een ongeldige valutacode laat de weergave niet crashen (al opgelost via useMoney/safeCurrency)', async () => {
    await i18next.changeLanguage('en');
    budgetWithPost(1);
    useAppStore.setState((s) => ({ schedule: { ...s.schedule, currency: 'eu' } }));
    const host = await render();
    expect(host.querySelector('.mobile-summary strong')?.textContent).toContain('€');
  });
});

describe('knownbug 207: hoeveelheden in de postenlijst', () => {
  it('volgen de getalnotatie en tonen geen float-ruis', async () => {
    await i18next.changeLanguage('nl');
    budgetWithPost(0.1 + 0.2);
    const host = await render();
    const meta = [...host.querySelectorAll('.mobile-item-meta')].map((el) => el.textContent ?? '');
    expect(meta.some((text) => text.includes('0,3 '))).toBe(true);
    expect(meta.join('|')).not.toContain('0.30000000000000004');
  });
});

describe('knownbug 209: heel kleine waarden in het mobiele formulier', () => {
  it('worden zonder exponentnotatie getoond, zodat ze weer te lezen zijn', () => {
    expect(formatInputNumber(5e-7, true)).toBe('0,0000005');
    expect(parseLocaleNumber(formatInputNumber(5e-7, true), true)).toBe(5e-7);
    expect(formatInputNumber(-1.5e-8, false)).toBe('-0.000000015');
    expect(formatInputNumber(1e21, false)).toBe('1000000000000000000000');
    expect(formatInputNumber(12.5, true)).toBe('12,5');
  });
});
