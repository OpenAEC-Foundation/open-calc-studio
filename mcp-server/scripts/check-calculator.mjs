// Integration regression: the real stdio MCP server must agree with the published core.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { calculateProject, deserializeProject, getStaartBreakdown } from '../../packages/embed/dist/core.js';

const cwd = fileURLToPath(new URL('..', import.meta.url));
const tmp = await mkdtemp(join(tmpdir(), 'ocs-parity-'));
const args = process.argv.includes('--bundled') ? ['dist/ocs-mcp.mjs'] : ['--import', 'tsx', 'src/index.ts'];
const transport = new StdioClientTransport({ command: process.execPath, args, cwd, stderr: 'pipe', env: { ...process.env, OCS_DISABLE_BRIDGE: '1' } });
const client = new Client({ name: 'calculator-parity', version: '1.0.0' });
async function call(name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  assert.ok(!result.isError, JSON.stringify(result));
  return JSON.parse(result.content[0].text);
}
try {
  await client.connect(transport);
  const sample = await readFile(new URL('../../public/data/voorbeeld.ifcCalc', import.meta.url), 'utf8');
  for (const variant of ['sample', 'hourly-rate', 'mixed-vat']) {
    const project = deserializeProject(sample);
    if (variant === 'hourly-rate') project.schedule.tarieven = { A: 50, B: 43, C: 60 };
    if (variant === 'mixed-vat') project.items.find(i => i.id === 'ch02').btwTarief = 'laag';
    const filePath = join(tmp, `${variant}.ocs`);
    await writeFile(filePath, JSON.stringify(project));
    await call('open_budget', { filePath });
    await call('update_item', { id: 'r03', changes: { quantity: 20 } });
    project.items.find(i => i.id === 'r03').quantity = 20;
    const expected = calculateProject(project);
    const actual = await call('get_budget_summary');
    assert.deepEqual(actual.breakdown, getStaartBreakdown(expected.items), variant);
    await call('save_budget', { filePath });
    const saved = JSON.parse(await readFile(filePath, 'utf8'));
    assert.deepEqual(saved.items.map(i => [i.id, i.total]), expected.items.map(i => [i.id, i.total]), variant);
    console.log(`${variant}: MCP and core agree (${actual.breakdown.aanneemsomAfgerond.toFixed(2)})`);
  }
  const xmlContent = '<RAWBestand><Bestek><Naam>RSX regression</Naam></Bestek><Deelraming code="01"><Resultaatsverplichting besteksnummer="01.01"><Omschrijving>Beton</Omschrijving><Hoeveelheid>20</Hoeveelheid><Eenheid>m3</Eenheid><Prijs>132</Prijs></Resultaatsverplichting></Deelraming></RAWBestand>';
  await call('import_rsx', { xmlContent, replace: true });
  const rsx = await call('get_budget_summary');
  assert.equal(rsx.breakdown.totaalKolommen, 2640);
  console.log('RSX: imported prices survive MCP recalculation (2640.00)');
} finally {
  await client.close();
  await rm(tmp, { recursive: true, force: true });
}
