import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { useAppStore } from '@/state/appStore';
import { openHostedFile, saveHostedFile } from '@/services/file/hostFileActions';
import { serializeDocument } from '@/services/file/documentSnapshot';
import type { SiteHost } from '@/services/file/siteHost';
import type { PriceOrigin, ResourceLibraryItem } from '@/types/costModel';

const article = (id: string, price: number): ResourceLibraryItem => ({
  id, code: id, description: id, unit: 'st', resourceType: 'materiaal', defaultUnitPrice: price, category: '',
});
const origin = (itemId: string, price: number): PriceOrigin => ({
  itemId, catalogueId: 'nl', catalogueVersion: '1', source: 'test', priceDate: null, currency: 'EUR', unit: 'st', price, appliedAt: '2026-11-01T00:00:00Z', locked: false,
});

// Gehost bestand met al twee prijsartikelen in de bibliotheek.
const base = JSON.parse(readFileSync('public/data/voorbeeld.ifcCalc', 'utf8'));
const hosted = JSON.stringify({ ...base, resourceLibrary: [article('A', 1), article('B', 2)] });
function host(): SiteHost {
  return { initialFileId: 'a', list: vi.fn(async () => []),
    open: vi.fn(async () => ({ id: 'a', name: 'Estimate.ifcCalc', version: '1', readOnly: false, bytes: new TextEncoder().encode(hosted) })),
    save: vi.fn(async () => ({ id: 'a', name: 'Estimate.ifcCalc', version: '2' })),
    versions: vi.fn(async () => []),
  };
}
beforeEach(() => { useAppStore.setState({ documents: [], activeDocumentId: '', items: [], subSheets: [] }); window.openaecHost = host(); });
afterEach(() => { delete window.openaecHost; vi.restoreAllMocks(); });

async function openWithPrices() {
  await openHostedFile('a');
  const rows = useAppStore.getState().items.filter(i => i.rowType === 'regel');
  // Rij 1 gebruikt artikel A (al in de gehoste bibliotheek), rij 2 een nieuw artikel C.
  useAppStore.setState({ items: useAppStore.getState().items.map(i =>
    i.id === rows[0].id ? { ...i, priceOrigin: origin('A', 1) } : i.id === rows[1].id ? { ...i, priceOrigin: origin('C', 3) } : i) });
}
const ids = (json: string) => (JSON.parse(json).resourceLibrary as ResourceLibraryItem[]).map(a => a.id).sort();

describe('knownbug 113: prijsartikelen van een gehost document', () => {
  it('het herstelpunt voegt samen op id, zonder dubbelen', async () => {
    await openWithPrices();
    const state = useAppStore.getState();
    const doc = state.documents.find(d => d.id === state.activeDocumentId)!;
    expect(ids(serializeDocument(state, doc))).toEqual(['A', 'B', 'C']);
  });

  it('opslaan bij de host houdt artikelen die in deze sessie zijn toegevoegd', async () => {
    await openWithPrices();
    await saveHostedFile(useAppStore.getState().activeDocumentId);
    const bytes = vi.mocked(window.openaecHost!.save).mock.calls[0][0];
    expect(ids(new TextDecoder().decode(bytes))).toEqual(['A', 'B', 'C']);
  });
});
