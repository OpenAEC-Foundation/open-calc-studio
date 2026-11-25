// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Knownbugs 176-180: de losse MCP-server (mcp-server/), via stdio aangeroepen zoals een echte client.
const serverDir = resolve(process.cwd(), 'mcp-server');
const sample = resolve(process.cwd(), 'public/data/voorbeeld.ifcCalc');
// De server draait via tsx uit mcp-server/node_modules (npm --prefix mcp-server ci). Lokaal zonder
// die installatie overslaan; in CI installeert de workflow ze en faalt een ontbrekende installatie hier.
const skip = !existsSync(join(serverDir, 'node_modules', 'tsx')) && !process.env.CI;
let client: Client;
let tmp: string;

async function raw(name: string, args: Record<string, unknown> = {}) {
  return client.callTool({ name, arguments: args }) as Promise<{ isError?: boolean; content: { text: string }[] }>;
}
async function call(name: string, args: Record<string, unknown> = {}) {
  const result = await raw(name, args);
  if (result.isError) throw new Error(`${name}: ${result.content[0].text}`);
  return JSON.parse(result.content[0].text);
}

beforeAll(async () => {
  if (skip) return;
  tmp = mkdtempSync(join(tmpdir(), 'ocs-kb-mcp-'));
  client = new Client({ name: 'knownbugs-mcp', version: '1.0.0' });
  await client.connect(new StdioClientTransport({
    command: process.execPath, args: ['--import', 'tsx', 'src/index.ts'], cwd: serverDir, stderr: 'pipe',
    env: { ...process.env, OCS_DISABLE_BRIDGE: '1' } as Record<string, string>,
  }));
}, 60000);
afterAll(async () => {
  await client?.close();
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

describe.skipIf(skip)('standalone MCP server sheets (knownbugs 176, 177)', () => {
  it('saves a removed sheet as removed', async () => {
    const file = join(tmp, 'remove.ifcCalc');
    copyFileSync(sample, file);
    await call('open_budget', { filePath: file });
    const { id } = await call('add_sheet', { name: 'Weg' });
    await call('add_sheet', { name: 'Blijft' });
    await call('save_budget');
    await call('open_budget', { filePath: file });
    await call('remove_sheet', { id });
    await call('save_budget');
    const saved = JSON.parse(readFileSync(file, 'utf8'));
    expect(saved.spreadsheets.sheets.map((s: { name: string }) => s.name)).toEqual(['Blijft']);
  });

  it('saves variant changes made through MCP, including a removed variant', async () => {
    const file = join(tmp, 'branches.ifcCalc');
    copyFileSync(sample, file);
    await call('open_budget', { filePath: file });
    await call('toggle_branches_enabled');
    const { branch } = await call('add_branch', { name: 'Optie' });
    await call('save_budget');
    expect(JSON.parse(readFileSync(file, 'utf8')).schedule.branches.map((b: { name: string }) => b.name)).toEqual(['main', 'Optie']);
    await call('open_budget', { filePath: file });
    await call('remove_branch', { id: branch.id });
    await call('save_budget');
    const saved = JSON.parse(readFileSync(file, 'utf8'));
    expect(saved.schedule.branchesEnabled).toBe(true);
    expect(saved.schedule.branches.map((b: { name: string }) => b.name)).toEqual(['main']);
  });

  it('shows the sheets of the budget that is open now, not of the previous one', async () => {
    const a = join(tmp, 'a.ifcCalc');
    const b = join(tmp, 'b.ifcCalc');
    copyFileSync(sample, a); copyFileSync(sample, b);
    await call('open_budget', { filePath: a });
    const { id } = await call('add_sheet', { name: 'Alleen in A' });
    await call('save_budget');
    await call('open_budget', { filePath: b });
    expect((await call('list_sheets')).count).toBe(0);
    expect((await raw('set_cell', { sheetId: id, ref: 'A1', value: '1' })).isError).toBe(true);
  });
});

describe.skipIf(skip)('standalone MCP server export_pdf (knownbugs 178, 179)', () => {
  it('leaves no temporary file next to the budget', async () => {
    const dir = mkdtempSync(join(tmp, 'pdf-'));
    const file = join(dir, 'begroting.ifcCalc');
    copyFileSync(sample, file);
    await call('open_budget', { filePath: file });
    await raw('export_pdf', { outputPath: join(dir, 'out.pdf') });
    expect(readdirSync(dir).filter(name => name.includes('_mcp_tmp'))).toEqual([]);
  });

  it('does not fail on the temporary file for an imported budget', async () => {
    const dir = mkdtempSync(join(tmp, 'pdf-import-'));
    const x83 = join(dir, 'tender.x83');
    const xml = '<?xml version="1.0"?><GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA83/3.3"><PrjInfo><NamePrj>Bridge</NamePrj><Cur>EUR</Cur></PrjInfo><Award><DP>83</DP><BoQ><BoQBody><BoQCtgy RNoPart="01"><LblTx>Concrete</LblTx><BoQBody><Itemlist><Item RNoPart="0010"><Qty>12.5</Qty><QU>m3</QU><Description><CompleteText><OutlineText><OutlTxt><TextOutlTxt><p>Concrete C30</p></TextOutlTxt></OutlTxt></OutlineText></CompleteText></Description></Item></Itemlist></BoQBody></BoQCtgy></BoQBody></BoQ></Award></GAEB>';
    writeFileSync(x83, xml);
    await call('open_budget', { filePath: x83 });
    const result = await raw('export_pdf', { outputPath: join(dir, 'out.pdf') });
    // Zonder gen_pdf-binary hoort de melding over gen_pdf te gaan, niet over een leeg pad.
    expect(result.content[0].text).not.toMatch(/ENOENT|open ''/);
    expect(readdirSync(dir).filter(name => name.includes('_mcp_tmp'))).toEqual([]);
  });
});

describe.skipIf(skip)('standalone MCP server import_uittrekstaat (knownbug 180)', () => {
  it('recognises m² and m³ and normalises the default unit', async () => {
    const file = join(tmp, 'units.ifcCalc');
    copyFileSync(sample, file);
    await call('open_budget', { filePath: file });
    const result = await call('import_uittrekstaat', {
      sectionTitle: 'Eenheden', defaultUnit: 'm2',
      data: 'Vloer\t12\tm²\n\nBeton\t3\tm³\n\nWand\t8',
    });
    expect(result.items.map((i: { unit: string }) => i.unit)).toEqual(['m\u00B2', 'm\u00B3', 'm\u00B2']);
  });
});
