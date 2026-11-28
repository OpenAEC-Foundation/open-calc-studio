import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useAppStore } from '@/state/appStore';
import { changeLanguage } from '@/i18n/config';
import { SummaryPanel } from '@/components/report/SummaryPanel';
import { createDefaultItems } from '@/data/defaultBudget';
import { getStaartBreakdown, recalculateItems } from '@/services/calculation/calculator';
import { formatMoney } from '@/utils/formatting';
import { makeCostItem } from '@/services/importers/core';

/** Eén post van 10.000 met de standaardstaart (Bouw 1-opslagen en btw). */
function budget() {
  const ch = makeCostItem({ parentId: null, sortOrder: 0, depth: 0, rowType: 'chapter', code: '01', description: 'Ruwbouw' });
  const post = makeCostItem({ parentId: ch.id, sortOrder: 0, depth: 1, rowType: 'begrotingspost', code: '01.01', description: 'Post', unit: 'st', quantity: 1 });
  const regel = makeCostItem({ parentId: post.id, sortOrder: 0, depth: 2, rowType: 'regel', code: '01.01.01', description: 'Materiaal', unit: 'st', quantity: 1, normUnitPrice: 10000, resourceType: 'materiaal' });
  const staart = createDefaultItems().filter(i => i.rowType.startsWith('staart_'));
  return recalculateItems([ch, post, regel, ...staart]);
}

const initial = useAppStore.getState();
let root: Root | undefined, node: HTMLDivElement;

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await changeLanguage('en');
  useAppStore.setState(initial, true);
});
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; node?.remove(); });

async function renderPanel() {
  node = document.createElement('div'); document.body.append(node); root = createRoot(node);
  await act(async () => root!.render(<SummaryPanel />));
}

const rowText = (label: string) => [...node.querySelectorAll('.summary-row')]
  .map(r => r.textContent ?? '')
  .find(text => text.startsWith(label));

describe('samenvattingspaneel (knownbugs 127, 130)', () => {
  it('toont onder "excl. VAT" het bedrag zonder btw, en daarna de btw en het totaal incl. btw', async () => {
    const items = budget();
    useAppStore.setState({ items });
    const bd = getStaartBreakdown(items);
    expect(bd.btwAmount).toBeGreaterThan(0);
    const currency = useAppStore.getState().schedule.currency;
    await renderPanel();

    const excl = rowText('Contract sum excl. VAT');
    expect(excl).toBeDefined();
    expect(excl).toContain(formatMoney(bd.aanneemsom + bd.afronding, currency));
    expect(excl).not.toContain(formatMoney(bd.aanneemsomAfgerond, currency));
    expect(rowText('Total incl. VAT')).toContain(formatMoney(bd.aanneemsomAfgerond, currency));
  });

  it('toont de opslagen van de Bouw 1-staart (de sectie bleef leeg)', async () => {
    const items = budget();
    useAppStore.setState({ items });
    await renderPanel();
    const risico = items.find(i => i.rowType === 'staart_risico')!;
    expect(risico.total).toBeGreaterThan(0);
    expect(node.textContent).toContain(`${risico.description.replace(/:$/, '')} (3%)`);
    const btw = items.find(i => i.rowType === 'staart_btw')!;
    expect(node.textContent).toContain(btw.description.replace(/:$/, ''));
  });
});
