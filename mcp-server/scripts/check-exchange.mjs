import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const cwd = fileURLToPath(new URL('..', import.meta.url));
const tmp = await mkdtemp(join(tmpdir(), 'ocs-exchange-'));
const args = process.argv.includes('--bundled') ? ['dist/ocs-mcp.mjs'] : ['--import', 'tsx', 'src/index.ts'];
const transport = new StdioClientTransport({ command: process.execPath, args, cwd, stderr: 'pipe', env: { ...process.env, OCS_DISABLE_BRIDGE: '1' } });
const client = new Client({ name: 'exchange-parity', version: '1.0.0' });
async function call(name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  assert.ok(!result.isError, JSON.stringify(result));
  return JSON.parse(result.content[0].text);
}
try {
  await client.connect(transport);
  const capabilities = await call('get_capabilities');
  assert.ok(capabilities.importFiles.includes('.x83'));
  assert.ok(capabilities.exportFiles.includes('.bc3'));
  const sample = await readFile(new URL('../../public/data/voorbeeld.ifcCalc', import.meta.url));
  const nativePath = join(tmp, 'sample.ocs');
  await writeFile(nativePath, sample);
  const source = await call('open_budget', { filePath: nativePath });
  assert.ok(source.itemCount > 0);
  for (const [format, extension] of [['bc3', 'bc3'], ['onlv', 'onlv'], ['cuf', 'cuf']]) {
    const outputPath = join(tmp, `sample.${extension}`);
    const exported = await call('export_exchange_file', { format, outputPath });
    assert.ok(exported.byteCount > 100, format);
    const imported = await call('open_budget', { filePath: outputPath });
    assert.ok(imported.itemCount > 0, format);
    console.log(`${format}: ${imported.itemCount} imported items`);
  }
  const x83Path = join(tmp, 'tender.x83');
  await writeFile(x83Path, `<?xml version="1.0"?><GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA83/3.3"><PrjInfo><NamePrj>Bridge</NamePrj><Cur>EUR</Cur></PrjInfo><Award><DP>83</DP><BoQ><BoQBody><BoQCtgy RNoPart="01"><LblTx>Concrete</LblTx><BoQBody><Itemlist><Item RNoPart="0010"><Qty>12.5</Qty><QU>m3</QU><Description><CompleteText><OutlineText><OutlTxt><TextOutlTxt><p>Concrete C30</p></TextOutlTxt></OutlTxt></OutlineText></CompleteText></Description></Item></Itemlist></BoQBody></BoQCtgy></BoQBody></BoQ></Award></GAEB>`);
  const gaeb = await call('open_budget', { filePath: x83Path });
  assert.equal(gaeb.itemCount, 2);
  assert.equal((await call('get_items')).items.find(i => i.rowType === 'begrotingspost').quantity, 12.5);
  const x84Path = join(tmp, 'offer.x84');
  await writeFile(x84Path, `<?xml version="1.0"?><GAEB><Award><DP>84</DP><BoQ><BoQBody><BoQCtgy RNoPart="01"><BoQBody><Itemlist><Item RNoPart="0010"><UP>145.50</UP></Item></Itemlist></BoQBody></BoQCtgy></BoQBody></BoQ></Award></GAEB>`);
  const priced = await call('apply_gaeb_x84', { filePath: x84Path });
  assert.equal(priced.pricedCount, 1);
  assert.equal((await call('get_items')).items.find(i => i.rowType === 'begrotingspost').total, 1818.75);
  const unsafeSave = await client.callTool({ name: 'save_budget', arguments: {} });
  assert.equal(unsafeSave.isError, true, 'imported GAEB must not be overwritten by native JSON');
  assert.match(await readFile(x83Path, 'utf8'), /^<\?xml/);
  await call('save_budget', { filePath: join(tmp, 'tender.ifcCalc') });
  console.log('gaeb: chapter and quantity imported');
} finally {
  await client.close();
  await rm(tmp, { recursive: true, force: true });
}
