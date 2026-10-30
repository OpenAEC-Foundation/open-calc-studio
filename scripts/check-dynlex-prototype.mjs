import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { recalculateItems, getStaartBreakdown } from '../packages/embed/dist/core.js';

const compiler = process.env.DYNLEX_COMPILER;
const library = process.env.DYNLEX_LIBRARY;
if (!compiler || !library) throw Error('Set DYNLEX_COMPILER and DYNLEX_LIBRARY (directory containing lib/std.dl).');
const temporary = mkdtempSync(join(tmpdir(), 'ocs-dynlex-'));
try {
  const binary = join(temporary, 'cost-line');
  const start = performance.now();
  execFileSync(resolve(compiler), [resolve('research/dynlex/cost-line.dl'), '-O2', '-o', binary], { cwd: resolve(library), stdio: 'pipe' });
  const compileMs = performance.now() - start;
  const template = JSON.parse(readFileSync('public/data/voorbeeld.ifcCalc', 'utf8')).items.find(item => item.rowType === 'begrotingspost');
  const inputs = [[10, 1.5, 50, 12.34, 10, 21], [42, 1.5, 50, 17.5, 10, 21], [0, 2, 45, 20, 7, 21], [12.5, .25, 43, 132, 5, 9], [1, 0, 0, 0, 0, 0]];
  const cases = inputs.map((values, index) => {
    const [quantity, norm, hourly, material, markup, vat] = values;
    const row = { ...template, id: 'line', parentId: null, sortOrder: 0, quantity, laborPrice: norm * hourly, materialPrice: material, normUnitPrice: 0, normQuantity: null, rowType: 'begrotingspost', btwTarief: 'hoog' };
    const items = recalculateItems([row,
      { ...row, id: 'markup', sortOrder: 1, rowType: 'staart_abk', staartPercentage: markup },
      { ...row, id: 'vat', sortOrder: 2, rowType: 'staart_btw', staartPercentage: vat },
    ]);
    const totals = getStaartBreakdown(items);
    const expected = [items[0].total, totals.aanneemsomExcl, totals.aanneemsomAfgerond];
    const began = performance.now();
    const actual = execFileSync(binary, { input: values.join(' ') + '\n', encoding: 'utf8', timeout: 5000 }).trim().split(/\s+/).map(Number);
    assert.equal(actual.length, 3);
    actual.forEach((value, field) => assert.ok(Number.isFinite(value) && Math.abs(value - expected[field]) < .0051, `case ${index}, field ${field}: ${value} != ${expected[field]}`));
    return { input: values, actual, expected, processWallMs: performance.now() - began };
  });
  const result = { compilerVersion: execFileSync(resolve(compiler), ['--version'], { encoding: 'utf8' }).trim(), compileMs, executableBytes: statSync(binary).size, cases,
    scope: 'Exploratory native single-line arithmetic prototype; CLI input edits quantity/rates. Not full project import, UI, mixed VAT, nested cost model, DLL or migration. Process startup timings are not comparable to warm core timings.' };
  if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(result, null, 2) + '\n');
  console.log('PASS DynLex native prototype: 5 editable input cases agree with the current core within half a cent');
} finally { rmSync(temporary, { recursive: true, force: true }); }
