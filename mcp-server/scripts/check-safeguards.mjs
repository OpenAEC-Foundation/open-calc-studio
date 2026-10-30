import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

const endpoint = process.env.OCS_DESKTOP_API_URL;
if (!['http://127.0.0.1:19742', 'http://127.0.0.1:29742'].includes(endpoint)) throw Error('Use a separately isolated test desktop on port 19742 or 29742.');
const cwd = fileURLToPath(new URL('..', import.meta.url)), root = resolve(cwd, '..');
const temp = await mkdtemp(join(tmpdir(), 'ocs-safeguards-mcp-'));
const client = new Client({ name: 'safeguards-native-integration', version: '1' });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [join(cwd, 'dist/ocs-mcp.mjs')], env: { ...process.env, OCS_DISABLE_BRIDGE: '1' } }));
const call = async (name, args = {}) => {
  const response = await client.callTool({ name, arguments: args }, undefined, { timeout: 120_000 });
  assert.ok(!response.isError, JSON.stringify(response)); return JSON.parse(response.content[0].text);
};
const act = (action, params = {}) => call('app_action', { action, params });
const created = new Set();
try {
  const project = JSON.parse(await readFile(join(root, 'public/data/voorbeeld.ifcCalc'), 'utf8'));
  const row = project.items.find(item => item.rowType === 'regel');
  Object.assign(row, { description: 'Safeguard brick', unit: 'st', quantity: 2, normQuantity: 1, normFactor: 1, normDivisor: 1, normUnitPrice: 10, materialPrice: null, laborPrice: null, tariefGroep: null, resourceLibraryId: 'owned:brick', priceOrigin: { itemId: 'owned:brick', catalogueId: 'owned', catalogueVersion: '1', source: 'Synthetic owned catalogue', priceDate: '2026-10-30', currency: project.schedule.currency, unit: 'st', price: 10, appliedAt: new Date().toISOString(), locked: false } });
  const first = (await act('openProject', { json: JSON.stringify(project), fileName: 'Safeguard A', filePath: '/tmp/do-not-overwrite.ifcCalc' })).documentId;
  created.add(first);
  const proposal = await act('pricing.preview', { catalogue: { id: 'owned', version: '2', currency: project.schedule.currency, resources: [{ id: 'brick', unit: 'st', defaultUnitPrice: 12, source: 'Synthetic owned catalogue', priceDate: '2026-10-30' }] } });
  assert.equal(proposal.rows.find(r => r.itemId === row.id).status, 'changed');
  await act('pricing.apply', { proposalId: proposal.proposalId, itemIds: [row.id] });
  assert.equal((await call('app_get_state')).items.find(r => r.id === row.id).normUnitPrice, 12);
  await act('undo');
  assert.equal((await call('app_get_state')).items.find(r => r.id === row.id).normUnitPrice, 10);
  const saved = await act('getProject'); assert.equal(saved.version, '2.4.0');
  assert.equal(saved.items.find(r => r.id === row.id).priceOrigin.source, 'Synthetic owned catalogue');
  await act('createSnapshot', { label: 'Safeguard snapshot A', type: 'concept' });
  const second = (await act('addDocument', { tab: { fileName: 'Safeguard B' } })).activeDocumentId;
  created.add(second); await act('addChapter', { parentId: null });
  await act('createSnapshot', { label: 'Safeguard snapshot B', type: 'concept' });
  let record;
  for (let n = 0; n < 20; n++) {
    record = (await act('recovery.list')).find(r => r.documents.some(d => d.fileName === 'Safeguard A') && r.documents.some(d => d.fileName === 'Safeguard B'));
    if (record) break; await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(record, 'The native IndexedDB recovery journal did not commit.');
  const restored = await act('recovery.restore', { id: record.id });
  for (const id of restored.documentIds) created.add(id);
  const restoredState = await call('app_get_state');
  assert.ok(restored.documentIds.every(id => restoredState.documents.find(d => d.id === id)?.filePath === null));
  assert.ok(restoredState.snapshots.some(snapshot => snapshot.label === 'Safeguard snapshot B'));
  console.log('PASS native catalogue preview/apply/undo, price provenance and multi-document IndexedDB recovery with snapshots');

  await act('setActiveDocument', { id: first });
  const chapter = (await act('addChapter', { parentId: null })).result;
  const post = (await act('addItem', { parentId: chapter })).result;
  const target = (await act('addRegel', { parentId: post })).result;
  const old = await call('app_open_ifc', { filePath: join(root, 'test/fixtures/ifc-lite/wall-quantities.ifc') });
  await act('ifc.takeoff', { elementIds: [20], quantityKey: 'Qto_WallBaseQuantities/NetVolume', itemId: target });
  const changed = (await readFile(join(root, 'test/fixtures/ifc-lite/wall-quantities.ifc'), 'utf8')).replace(/#20\b/g, '#120').replace("'NetVolume',$,$,2.4", "'NetVolume',$,$,4.8");
  const path = join(temp, 'revised.ifc'); await writeFile(path, changed);
  const next = await call('app_open_ifc', { filePath: path });
  const revisions = await act('revisions.preview', { previousId: old.modelId, nextId: next.modelId });
  assert.equal(revisions.rows.find(row => row.itemId === target).after, 4.8);
  await act('revisions.apply', { proposalId: revisions.proposalId, itemIds: [target] });
  const item = (await call('app_get_state')).items.find(row => row.id === target);
  assert.equal(item.quantity, 4.8); assert.deepEqual(item.quantityOrigin.sources[0].elementIds, [120]);
  await act('undo'); assert.equal((await call('app_get_state')).items.find(row => row.id === target).quantity, 2.4);
  console.log('PASS native IFC GlobalId revision matching, selected relink and undo');
} finally {
  for (const id of [...created].reverse()) await act('removeDocument', { id }).catch(() => {});
  await client.close(); await rm(temp, { recursive: true, force: true });
}
