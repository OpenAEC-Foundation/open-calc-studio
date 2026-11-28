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

  it('secundaire knoppen en schuifbalken alleen voor blueprint en high-contrast, light en dark houden themes.css', () => {
    const bridge = readFileSync(join(SRC, 'styles', 'blueprintBridge.css'), 'utf8');
    const blocks = [...bridge.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].replace(/\/\*[\s\S]*?\*\//g, '').trim(), body: m[2] }));
    const names = ['--theme-btn-secondary-bg', '--theme-btn-secondary-text', '--theme-btn-secondary-hover-bg', '--theme-btn-secondary-hover-border', '--theme-scrollbar-track', '--theme-scrollbar-thumb'];
    for (const name of names) {
      const holders = blocks.filter((b) => new RegExp(`${name}\\s*:`).test(b.body));
      expect(holders.length, name).toBe(1);
      const selectors = holders[0].selector.split(',').map((x) => x.trim());
      expect(selectors.sort(), name).toEqual(['[data-theme="blueprint"]', '[data-theme="high-contrast-dark"]', '[data-theme="high-contrast-light"]']);
    }
  });
});

describe('knownbugs 214, 217: geen hardgecodeerd wit op accent- of selectiekleur', () => {
  // --oa-text-on-accent is donker in light, dark, blueprint en high-contrast-dark;
  // --theme-active is in de lichte thema's bijna wit.
  const accentBg = /background(?:-color)?\s*:\s*['"]?var\(--theme-(?:accent|accent-hover|active)\b/;
  const white = /(?<![-\w])color\s*:\s*['"]?(?:#fff\b|#ffffff\b|white\b)/i;
  it('CSS-regels', () => {
    const bad: string[] = [];
    for (const file of files(SRC).filter((f) => f.endsWith('.css'))) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(/\{[^{}]*\}/g)) if (accentBg.test(m[0]) && white.test(m[0])) bad.push(`${relative(SRC, file)}:${text.slice(0, m.index).split('\n').length}`);
    }
    expect(bad).toEqual([]);
  });
  it('inline stijlen', () => {
    const bad: string[] = [];
    for (const file of files(SRC).filter((f) => f.endsWith('.tsx'))) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(/style=\{\{[^}]*\}\}/g)) if (accentBg.test(m[0]) && white.test(m[0])) bad.push(relative(SRC, file));
      for (const m of text.matchAll(/\?\s*'var\(--theme-accent\)'[^\n]*\n[^\n]*color:\s*[^?\n]*\?\s*'(?:#fff|white)'/g)) bad.push(`${relative(SRC, file)} (${m[0].length})`);
    }
    expect(bad).toEqual([]);
  });
});

describe('knownbug 216: sluitknoppen hebben een leesbare hover', () => {
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  it('wit kruis op een vast rood met minstens 4,5:1 contrast', () => {
    const bridge = readFileSync(join(SRC, 'styles', 'blueprintBridge.css'), 'utf8');
    for (const name of ['--theme-close-hover-bg', '--theme-close-active-bg']) {
      const hex = new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`).exec(bridge)?.[1];
      expect(hex, name).toBeTruthy();
      expect(1.05 / (luminance(hex!) + 0.05)).toBeGreaterThanOrEqual(4.5);
    }
    const titleBar = readFileSync(join(SRC, 'components', 'layout', 'TitleBar.css'), 'utf8');
    const modal = readFileSync(join(SRC, 'components', 'common', 'Modal.css'), 'utf8');
    expect(titleBar).toMatch(/\.titlebar-close:hover \{ background-color: var\(--theme-close-hover-bg\)/);
    expect(modal).toMatch(/\.modal-close-btn:hover \{\s*background: var\(--theme-close-hover-bg\)/);
  });
});

describe('knownbug 219: syntaxkleuren in alle donkere thema\'s', () => {
  it('elke donkere override in ifc.css geldt ook voor blueprint en high-contrast-dark', () => {
    const css = readFileSync(join(SRC, 'components', 'report', 'ifc.css'), 'utf8');
    const selectors = [...css.matchAll(/([^{}\n]*\[data-theme="dark"\][^{}\n]*)\{/g)].map((m) => m[1]);
    expect(selectors.length).toBeGreaterThan(0);
    for (const selector of selectors) {
      expect(selector).toContain('[data-theme="blueprint"]');
      expect(selector).toContain('[data-theme="high-contrast-dark"]');
    }
  });
});
