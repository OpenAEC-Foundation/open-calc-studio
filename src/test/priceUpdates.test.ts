import { beforeEach, expect, it } from 'vitest';
import { useAppStore } from '@/state/appStore';
import { parseLibraryJson } from '@/state/slices/resourceLibrarySlice';
import { capturePriceOrigin, previewPriceUpdates, usedPriceArticles } from '@/services/pricing/priceUpdates';
import { priceUpdateCommand } from '@/services/pricing/priceUpdateCommands';
import { executeDesktopCommand } from '@/services/mcp/desktopCommand';
import { serializeProject, deserializeProject } from '@/services/file/fileService';
const initial = useAppStore.getState();
const catalogue = (price: number, version = 1) => ({ id: 'owned', version, currency: 'EUR', resources: [{ id: 'brick', code: 'A', description: 'Brick', unit: 'st', source: 'Owned catalogue', priceDate: '2026-10-30', defaultUnitPrice: price }] });
let id: string;
beforeEach(() => {
  useAppStore.setState(initial, true); const s = useAppStore.getState(); s.addDocument();
  const chapter = s.addChapter(null), post = s.addItem(chapter); id = s.addRegel(post);
  s.updateItem(id, 'unit', 'st'); s.updateItem(id, 'quantity', 3); s.updateItem(id, 'normUnitPrice', 10); s.updateItem(id, 'normQuantity', 1); s.updateItem(id, 'normFactor', 1); s.updateItem(id, 'normDivisor', 1);
  const article = parseLibraryJson(catalogue(10))[0];
  useAppStore.setState(s => ({ items: s.items.map(item => item.id === id ? { ...item, resourceLibraryId: article.id, priceOrigin: capturePriceOrigin(article, 'EUR') } : item) }));
});
it('stable article identities survive reordering and remain distinct between catalogues', () => {
  const a = catalogue(10), b = { ...a.resources[0], id: 'other' };
  const old = parseLibraryJson({ ...a, resources: [a.resources[0], b] }), next = parseLibraryJson({ ...a, resources: [b, a.resources[0]] });
  expect(old[0].id).toBe(next[1].id); expect(parseLibraryJson({ ...a, id: 'supplier-b' })[0].id).not.toBe(old[0].id);
  expect(() => parseLibraryJson({ ...a, resources: [b, b] })).toThrow('Duplicate');
});
it('preserves source/version/date and applied price in ordinary save/open', () => {
  const s = useAppStore.getState(), restored = deserializeProject(serializeProject(s.schedule, s.items));
  expect(restored.items.find(item => item.id === id)?.priceOrigin).toMatchObject({ source: 'Owned catalogue', catalogueVersion: '1', priceDate: '2026-10-30', price: 10 });
  expect(restored.resourceLibrary?.[0]).toMatchObject({ catalogueId: 'owned', defaultUnitPrice: 10 });
});
it('embeds one newest source article while every row retains its own exact applied version', () => {
  const item = useAppStore.getState().items.find(item => item.id === id)!;
  const newer = { ...item, priceOrigin: { ...item.priceOrigin!, price: 12, catalogueVersion: '2', appliedAt: '2026-10-30T12:00:00Z' } };
  const older = { ...item, id: 'older-row', priceOrigin: { ...item.priceOrigin!, appliedAt: '2026-10-29T12:00:00Z' } };
  expect(usedPriceArticles([newer, older])).toMatchObject([{ id: item.priceOrigin!.itemId, catalogueVersion: '2', defaultUnitPrice: 12 }]);
  expect(older.priceOrigin.price).toBe(10);
});
it('previews without mutation, selectively applies one action, preserves norms and supports MCP undo', async () => {
  const s = useAppStore.getState(), before = s.items;
  const proposal = priceUpdateCommand('preview', { catalogue: catalogue(12, 2) }) as { proposalId: string; rows: { status: string }[] };
  expect(proposal.rows[0].status).toBe('changed'); expect(useAppStore.getState().items).toBe(before);
  priceUpdateCommand('apply', { proposalId: proposal.proposalId, itemIds: [id] });
  expect(useAppStore.getState().items.find(item => item.id === id)).toMatchObject({ quantity: 3, normQuantity: 1, normFactor: 1, normDivisor: 1, normUnitPrice: 12, priceOrigin: { catalogueVersion: '2' } });
  await executeDesktopCommand('undo'); expect(useAppStore.getState().items.find(item => item.id === id)?.normUnitPrice).toBe(10);
});
it('protects manual prices, incompatible units/currencies and inactive variants', () => {
  const s = useAppStore.getState(); s.updateItem(id, 'normUnitPrice', 15);
  let plan = previewPriceUpdates(useAppStore.getState().items, s.schedule, parseLibraryJson(catalogue(12))); expect(plan.rows[0].status).toBe('override');
  useAppStore.setState(s => ({ items: s.items.map(item => item.id === id ? { ...item, normUnitPrice: 10, priceOrigin: { ...item.priceOrigin!, locked: false } } : item) }));
  plan = previewPriceUpdates(useAppStore.getState().items, s.schedule, parseLibraryJson({ ...catalogue(12), currency: 'USD' })); expect(plan.rows[0].status).toBe('currency');
  plan = previewPriceUpdates(useAppStore.getState().items, s.schedule, parseLibraryJson({ ...catalogue(12), resources: [{ ...catalogue(12).resources[0], unit: 'm' }] })); expect(plan.rows[0].status).toBe('unit');
  const state = useAppStore.getState(); useAppStore.setState({ items: state.items.map(item => item.id === id ? { ...item, branchId: 'inactive' } : item) });
  plan = previewPriceUpdates(useAppStore.getState().items, { ...s.schedule, branchesEnabled: true, activeBranchId: 'main', branches: [] }, parseLibraryJson(catalogue(12))); expect(plan.rows[0].status).toBe('inactive');
});
it('rejects a stale proposal and invalid row selections before any change', () => {
  const proposal = priceUpdateCommand('preview', { catalogue: catalogue(12, 2) }) as { proposalId: string };
  expect(() => priceUpdateCommand('apply', { proposalId: proposal.proposalId, itemIds: ['unknown'] })).toThrow();
  useAppStore.getState().updateItem(id, 'quantity', 4);
  expect(() => priceUpdateCommand('apply', { proposalId: proposal.proposalId, itemIds: [id] })).toThrow('changed');
  expect(useAppStore.getState().items.find(item => item.id === id)?.normUnitPrice).toBe(10);
});
