import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
const endpoint = process.env.OCS_DESKTOP_API_URL;
if (!['http://127.0.0.1:19742', 'http://127.0.0.1:29742'].includes(endpoint)) throw Error('Only run against an isolated test desktop.');
const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const sample = JSON.parse(await readFile(join(root, 'public/data/voorbeeld.ifcCalc'), 'utf8'));
const template = sample.items.find(item => item.rowType === 'regel'), chapter = sample.items.find(item => item.rowType === 'chapter');
async function command(action, params = {}) {
  const response = await fetch(endpoint + '/api/v1/command', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, params }), signal: AbortSignal.timeout(120_000) });
  assert.ok(response.ok, `Command ${action}: HTTP ${response.status}`);
  const result = await response.json(); assert.ok(result.success, result.error); return result.result;
}
async function memory() {
  const pid = Number(process.env.OCS_TEST_PID);
  if (!pid) return { available: false };
  const parents = new Map();
  for (const name of await readdir('/proc')) if (/^\d+$/.test(name)) {
    try { const stat = await readFile(`/proc/${name}/stat`, 'utf8'); parents.set(Number(name), Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1])); } catch { /* process exited */ }
  }
  const ids = new Set([pid]); let changed = true;
  while (changed) { changed = false; for (const [child, parent] of parents) if (ids.has(parent) && !ids.has(child)) { ids.add(child); changed = true; } }
  let rss = 0, pss = 0, rssMeasured = 0, pssMeasured = 0;
  for (const id of ids) {
    try {
      const text = await readFile(`/proc/${id}/smaps_rollup`, 'utf8');
      rss += Number(/^Rss:\s+(\d+)/m.exec(text)?.[1] ?? 0);
      pss += Number(/^Pss:\s+(\d+)/m.exec(text)?.[1] ?? 0); rssMeasured++; pssMeasured++;
    } catch {
      try {
        const text = await readFile(`/proc/${id}/status`, 'utf8'), match = /^VmRSS:\s+(\d+)/m.exec(text);
        if (match) { rss += Number(match[1]); rssMeasured++; }
      } catch { /* process exited or access denied */ }
    }
  }
  return { available: rssMeasured > 0, processesMeasured: rssMeasured, pssProcessesMeasured: pssMeasured, treeProcesses: ids.size,
    rssMiB: rssMeasured ? Math.round(rss/1024*10)/10 : null,
    pssMiB: pssMeasured > 0 && pssMeasured === rssMeasured ? Math.round(pss/1024*10)/10 : null };

}
const results = []; let documentId;
try {
  await command('setActiveContentTab', { tab: 'grid' });
  results.push({ baseline: 'No capacity dataset open; heap may be retained from prior integration checks', memory: await memory() });
  for (const count of [1000, 10_000, 50_000]) {
    const items = [];
    for (let i = 0; i < count; i++) {
      const parentId = `capacity-chapter-${Math.floor(i/100)}`;
      if (i % 100 === 0) items.push({ ...chapter, id: parentId, parentId: null, depth: 0, sortOrder: i/100 });
      items.push({ ...template, id: `capacity-row-${i}`, parentId, depth: 1, sortOrder: i%100, quantity: 2, unit: 'st', normQuantity: 1, normFactor: 1, normDivisor: 1, normUnitPrice: 10, tariefGroep: null, materialPrice: null, laborPrice: null, resourceType: 'materiaal', quantityLink: null, history: undefined });
    }
    const project = { ...sample, version: '2.4.0', schedule: { ...sample.schedule, name: `Capacity ${count}`, directCostsOnly: true }, items, resourceLibrary: [], spreadsheets: { sheets: [], activeSheetId: null }, snapshots: [] };
    const json = JSON.stringify(project), start = performance.now();
    documentId = (await command('openProject', { json, fileName: `Capacity ${count}` })).documentId;
    let summary;
    for (let n = 0; n < 100; n++) {
      summary = await (await fetch(endpoint + '/api/v1/budget/summary')).json();
      if (summary.schedule?.name === `Capacity ${count}`) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(summary.schedule.name, `Capacity ${count}`); assert.equal(summary.itemCount, items.length);
    const total = summary.chapters.reduce((sum, item) => sum + item.total, 0); assert.ok(Math.abs(total - count * 20) < .001);
    const loadAndSyncMs = Math.round(performance.now() - start);
    await new Promise(resolve => setTimeout(resolve, 1000));
    const usage = await memory(); results.push({ rows: count, projectBytes: Buffer.byteLength(json), loadAndSyncMs, total, memory: usage });
    console.log(`PASS native capacity ${count} rows: ${loadAndSyncMs} ms to synchronized state; RSS ${usage.rssMiB ?? 'unavailable'} MiB; PSS ${usage.pssMiB ?? 'unavailable'}`);
    await command('removeDocument', { id: documentId }); documentId = undefined;
  }
  await writeFile(process.argv[2] ?? '/tmp/ocs-native-capacity.json', JSON.stringify({ version: '2026.44.6', measurementsPerSize: 1, limitations: ['Native programmatic load/state checks, not a visual frame-rate test', 'Linux process-tree memory; no forced GC; sequential datasets may retain previous heap capacity', 'Shared-page RSS can double count; PSS is provided when accessible', 'No real phone or cloud capacity claim'], results }, null, 2) + '\n');
} finally { if (documentId) await command('removeDocument', { id: documentId }).catch(() => {}); }
