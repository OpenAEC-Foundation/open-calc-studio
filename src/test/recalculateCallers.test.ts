import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Bewaakt dat elke aanroep van `recalculateItems(` de afrondingsregel van de
 * begroting meegeeft (#83). Zonder derde argument rekent de calculator
 * onafgerond, en zet de eerstvolgende bewerking de centafronding van een
 * BC3-begroting stil terug. Dat is hetzelfde patroon als knownbug 286, waar
 * aanroepen de effectieve uurtarieven vergaten.
 *
 * Een aanroep slaagt als de tekst tot het sluithaakje `priceRounding`
 * bevat, of als op die regel of de regel erboven
 * `// priceRounding: n.v.t. — <reden>` staat (bv. een nieuwe import zonder
 * afrondingsregel).
 *
 * Omwegen die de scan anders mist, gelden ook als fout (tenzij gemarkeerd):
 * een import of export onder een andere naam (`recalculateItems as recalc`)
 * en de functie als waarde doorgeven (`.map(recalculateItems)`,
 * `const f = recalculateItems`). Gescand worden `src/` (zonder `src/test`)
 * en `mcp-server/src/`.
 */

// vitest draait vanuit de projectwortel (jsdom kent geen file-URL's).
const ROOT = process.cwd();
const SRC = path.resolve(ROOT, 'src');
const SCAN_ROOTS = [SRC, path.resolve(ROOT, 'mcp-server', 'src')];
const SKIP_DIRS = new Set([path.join(SRC, 'test'), 'node_modules', 'dist']);
const DEFINITION = path.join(SRC, 'services', 'calculation', 'calculator.ts');
const NVT = 'priceRounding: n.v.t.';

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(full) && !SKIP_DIRS.has(name)) out.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(name) && !/\.d\.ts$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

/** Index net na een string (', ", `) of commentaar dat op `i` begint, of -1 als daar niets begint. */
function skipLiteral(text: string, i: number): number {
  const c = text[i];
  if (c === '/' && text[i + 1] === '/') {
    const end = text.indexOf('\n', i);
    return end < 0 ? text.length : end;
  }
  if (c === '/' && text[i + 1] === '*') {
    const end = text.indexOf('*/', i + 2);
    return end < 0 ? text.length : end + 2;
  }
  if (c === '\'' || c === '"' || c === '`') {
    let j = i + 1;
    while (j < text.length && text[j] !== c) j += text[j] === '\\' ? 2 : 1;
    return j + 1;
  }
  return -1;
}

/**
 * Tekst vanaf `start` (net na het openhaakje) tot en met het bijbehorende
 * sluithaakje. Haakjes in strings en commentaar tellen niet mee.
 */
function callText(text: string, start: number): string {
  let depth = 1;
  let i = start;
  while (i < text.length && depth > 0) {
    const skip = skipLiteral(text, i);
    if (skip >= 0) { i = skip; continue; }
    if (text[i] === '(') depth++;
    else if (text[i] === ')') depth--;
    i++;
  }
  return text.slice(start, i);
}

/** Bereiken van `import {…} from '…'` en `export {…} from '…'` (ook over meerdere regels). */
function importRanges(text: string): Array<[number, number]> {
  const re = /\b(?:import|export)\s+(?:type\s+)?\{[^}]*\}\s*from\s*['"][^'"]+['"]/g;
  const out: Array<[number, number]> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push([m.index, m.index + m[0].length]);
  return out;
}

/** Alle verdachte plekken in één bestand, als 1-based regelnummers met de reden. */
function uncheckedInText(text: string, isDefinition = false): Array<{ line: number; reason: string }> {
  const missing: Array<{ line: number; reason: string }> = [];
  if (!text.includes('recalculateItems')) return missing;
  const lines = text.split('\n');
  const imports = importRanges(text);
  const re = /\brecalculateItems\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const lineNo = text.slice(0, m.index).split('\n').length; // 1-based
    const line = lines[lineNo - 1];
    const before = text.slice(text.lastIndexOf('\n', m.index - 1) + 1, m.index);
    const trimmed = before.trimStart();
    // Commentaar telt niet.
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*') || before.includes('//')) continue;
    // Een string (bv. een foutmelding) met de naam erin telt ook niet.
    if (/^['"`]/.test(text.slice(m.index - 1, m.index))) continue;
    if (line.includes(NVT) || (lineNo > 1 && lines[lineNo - 2].includes(NVT))) continue;
    const after = text.slice(m.index + m[0].length);
    const inImport = imports.some(([a, b]) => m!.index >= a && m!.index < b);
    if (inImport || /^\s+as\s/.test(after)) {
      // Een gewone import/export mag; onder een andere naam is de scan blind.
      if (/^\s+as\s+(?!recalculateItems\b)\w/.test(after)) missing.push({ line: lineNo, reason: 'alias' });
      continue;
    }
    if (isDefinition && /function\s+$/.test(before)) continue;
    const call = /^\s*\(/.exec(after);
    if (!call) {
      // De functie als waarde: `.map(recalculateItems)`, `const f = recalculateItems`.
      missing.push({ line: lineNo, reason: 'waarde' });
      continue;
    }
    const body = callText(text, m.index + m[0].length + call[0].length);
    if (body.includes('priceRounding')) continue;
    missing.push({ line: lineNo, reason: 'geen priceRounding' });
  }
  return missing;
}

function uncheckedCalls(): string[] {
  const missing: string[] = [];
  for (const root of SCAN_ROOTS) {
    for (const file of sourceFiles(root)) {
      const text = readFileSync(file, 'utf-8');
      for (const { line, reason } of uncheckedInText(text, file === DEFINITION)) {
        missing.push(`${path.relative(ROOT, file).replace(/\\/g, '/')}:${line} (${reason})`);
      }
    }
  }
  return missing;
}

describe('recalculateItems-aanroepen geven de afrondingsregel mee (#83)', () => {
  it('elke aanroep buiten src/test geeft priceRounding mee of is gemarkeerd als n.v.t.', () => {
    expect(uncheckedCalls()).toEqual([]);
  });

  it('vindt de aanroepen echt (de scan is niet leeg), ook in mcp-server', () => {
    const count = (files: string[]) => files
      .filter(f => f !== DEFINITION)
      .reduce((n, f) => n + (readFileSync(f, 'utf-8').match(/recalculateItems\(/g)?.length ?? 0), 0);
    expect(count(sourceFiles(SRC))).toBeGreaterThan(20);
    expect(count(sourceFiles(SCAN_ROOTS[1]))).toBeGreaterThan(2);
  });
});

describe('de scan zelf', () => {
  const reasons = (code: string) => uncheckedInText(code).map(f => f.reason);

  it('keurt een aanroep met regel en een gemarkeerde aanroep goed', () => {
    expect(reasons('x = recalculateItems(items, t, s.priceRounding);')).toEqual([]);
    expect(reasons('// priceRounding: n.v.t. — nieuwe import\nx = recalculateItems(items);')).toEqual([]);
    expect(reasons("import { effectiveTarieven, recalculateItems } from './calculator';")).toEqual([]);
    expect(reasons("export {\n  recalculateItems,\n  getKostprijs,\n} from './calculator';")).toEqual([]);
  });

  it('ziet een aanroep zonder regel', () => {
    expect(reasons('x = recalculateItems(items, t);')).toEqual(['geen priceRounding']);
  });

  it('ziet een import onder een andere naam', () => {
    expect(reasons("import { recalculateItems as recalc } from './calculator';\nrecalc(items);")).toEqual(['alias']);
    expect(reasons("import {\n  recalculateItems as recalc,\n} from './calculator';")).toEqual(['alias']);
    expect(reasons("export { recalculateItems as recalc } from './calculator';")).toEqual(['alias']);
  });

  it('ziet de functie als callback of waarde', () => {
    expect(reasons('const out = lists.map(recalculateItems);')).toEqual(['waarde']);
    expect(reasons('const f = recalculateItems;')).toEqual(['waarde']);
  });

  it('telt haakjes in strings en commentaar niet mee', () => {
    // Zonder overslaan sluit ')' in de string de aanroep al vóór priceRounding.
    expect(reasons("x = recalculateItems(label(')'), t, s.priceRounding);")).toEqual([]);
    expect(reasons('x = recalculateItems(f(`)`), /* ) */ t, s.priceRounding);')).toEqual([]);
    // En een '(' in een string laat de aanroep niet doorlopen tot een latere priceRounding.
    expect(reasons("x = recalculateItems(items, '(');\ny = s.priceRounding;")).toEqual(['geen priceRounding']);
  });
});
