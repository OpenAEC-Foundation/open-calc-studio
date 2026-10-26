#!/usr/bin/env node
// Optional real-fixture verification. External examples are not redistributed in this repo.
import {createServer} from 'vite';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const folder = process.argv[2];
if (!folder) throw new Error('Usage: node scripts/verify-budget-fixtures.mjs /path/to/downloaded/examples');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({root,configFile:false,resolve:{alias:{'@':path.join(root,'src')}},optimizeDeps:{noDiscovery:true,entries:[]},server:{middlewareMode:true,watch:null,hmr:false,ws:false},appType:'custom'});
try {
  const api = await server.ssrLoadModule('/src/lib/converters.ts');
  const calc = await server.ssrLoadModule('/src/lib/core.ts');
  for (const [file,format,count] of [['it-palazzo-poggi.xpwe','xpwe',844],['cz-kadan-stage1.xml','xc4',88],['cz-kadan-stage2.xml','xc4',578]]) {
    const bytes = await readFile(path.join(folder,file));
    const converted = api.convertToIfcCalc(bytes,file);
    const project = calc.deserializeProject(new TextDecoder().decode(converted.data));
    assert.equal(project.items.filter(i => i.rowType === 'begrotingspost').length,count);
    const returned = api.convertFromIfcCalc(calc.calculateProject(project),format);
    assert.deepEqual(Buffer.from(returned.data),bytes);
    const item = project.items.find(i => i.rowType === 'begrotingspost');
    const sourceId = project.schedule.budgetExchange.references[item.id];
    item.materialPrice = (item.materialPrice ?? 0) + 1;
    const edited = api.convertFromIfcCalc(project,format);
    const reread = api.importXmlBudget(new TextDecoder().decode(edited.data));
    const mapped = reread.items.find(i => reread.schedule.budgetExchange.references[i.id] === sourceId);
    assert.equal(mapped.materialPrice,item.materialPrice);
    assert.equal(reread.items.filter(i => i.rowType === 'begrotingspost').length,count);
    console.log(`${file}: ${count} posts, saved/reopened/recalculated, byte-identical return; edited price re-import verified`);
  }
} finally {await server.close();}
