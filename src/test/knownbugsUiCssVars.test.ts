import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'test' ? [] : files(path);
    return /\.(css|tsx?)$/.test(name) ? [path] : [];
  });
}

describe('knownbug 221: gebruikte themavariabelen bestaan', () => {
  it('elke var(--theme-…) zonder terugvalwaarde is ergens gedefinieerd', () => {
    const defined = new Set<string>();
    const used = new Map<string, string>();
    for (const file of files(SRC)) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(/(--[\w-]+)\s*:/g)) defined.add(m[1]);
      for (const m of text.matchAll(/setProperty\(\s*['"`](--[\w-]+)/g)) defined.add(m[1]);
      for (const m of text.matchAll(/var\(\s*(--theme-[\w-]+)\s*\)/g)) if (!used.has(m[1])) used.set(m[1], relative(SRC, file));
    }
    const missing = [...used].filter(([name]) => !defined.has(name)).map(([name, file]) => `${name} (${file})`);
    expect(missing).toEqual([]);
  });
});

describe('knownbug 215: de Blueprint-brug dekt elke gebruikte themavariabele', () => {
  it('blueprint en high-contrast hebben geen blok in themes.css, dus de brug moet alles definiëren', () => {
    const bridge = readFileSync(join(SRC, 'styles', 'blueprintBridge.css'), 'utf8');
    const bridged = new Set([...bridge.matchAll(/(--theme-[\w-]+)\s*:/g)].map((m) => m[1]));
    const missing = new Set<string>();
    for (const file of files(SRC)) {
      if (/[\\/]styles[\\/](themes|blueprintBridge)\.css$/.test(file)) continue;
      for (const m of readFileSync(file, 'utf8').matchAll(/var\(\s*(--theme-[\w-]+)\s*\)/g)) if (!bridged.has(m[1])) missing.add(m[1]);
    }
    expect([...missing].sort()).toEqual([]);
  });
});
