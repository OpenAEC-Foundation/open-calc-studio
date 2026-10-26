#!/usr/bin/env node
// Uses Vite's source loader so the repository command works before a library build.
import { createServer } from 'vite';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const [input, output, currencyOrProfile] = process.argv.slice(2);
if (!input || !output) {
  console.error('Usage: node scripts/convert-budget.mjs input.xpwe output.ifcCalc [EUR|profile.json]\n       node scripts/convert-budget.mjs input.ifcCalc output.xpwe|output.xc4|output.csv|output.xlsx');
  process.exitCode = 1;
} else {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const server = await createServer({ root, configFile:false, resolve:{ alias:{ '@':path.join(root,'src') } }, optimizeDeps:{noDiscovery:true,entries:[]}, server:{ middlewareMode:true,watch:null,hmr:false,ws:false }, appType:'custom' });
  try {
    const api = await server.ssrLoadModule('/src/lib/converters.ts');
    const ext = path.extname(output).toLowerCase();
    const source = await readFile(input);
    const options = currencyOrProfile?.endsWith('.json') ? {profile:JSON.parse(await readFile(currencyOrProfile,'utf8'))} : {currency:currencyOrProfile};
    let result;
    if (ext === '.ifccalc') result = api.convertToIfcCalc(source,path.basename(input),options);
    else if (['.csv','.xlsx'].includes(ext)) result = api.convertFromIfcCalc(source.toString('utf8'),ext.slice(1),path.basename(output));
    else if (['.xpwe','.xc4','.xml'].includes(ext)) result = api.convertFromIfcCalc(source.toString('utf8'),ext === '.xpwe' ? 'xpwe' : 'xc4',path.basename(output));
    else throw new Error('Output must be .ifcCalc, .xpwe, .xc4, .xml (XC4), .csv or .xlsx.');
    // Never overwrite an existing estimate by accident.
    await writeFile(output,result.data,{flag:'wx'});
    console.log(JSON.stringify({output,warnings:result.warnings},null,2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally { await server.close(); }
}
