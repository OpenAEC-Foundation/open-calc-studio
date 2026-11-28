import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LANGUAGES } from '@/i18n/config';

/**
 * Documentatie die de app tegenspreekt (knownbugs 230-237). Deze controles
 * lezen de bestanden zelf, zodat een oude bewering niet stil terugkomt.
 */
const read = (file: string) => readFileSync(join(process.cwd(), file), 'utf8');
const embedReadme = read('packages/embed/README.md');
const interfaceLanguages = LANGUAGES.filter((l) => l.code !== 'auto').length;

describe('embed README (knownbugs 232, 235, 236)', () => {
  it('names the real language count', () => {
    expect(interfaceLanguages).toBe(40);
    expect(embedReadme).toContain(`Interface in ${interfaceLanguages} languages`);
    expect(embedReadme).toContain(`… (${interfaceLanguages})`);
    expect(embedReadme).not.toMatch(/\b39\b/);
    expect(read('src/lib/index.tsx')).not.toContain('39 codes');
  });

  it('lists the theme values that blueprintTheme accepts and documents mode and opaque', () => {
    const themeRow = embedReadme.split('\n').find((line) => line.startsWith('| `theme`'))!;
    for (const theme of ['light', 'dark', 'blueprint', 'high-contrast-dark', 'high-contrast-light', 'system']) {
      expect(themeRow).toContain(`\`${theme}\``);
    }
    expect(embedReadme).toMatch(/^\| `mode` \|/m);
    expect(embedReadme).toMatch(/`opaque`/);
  });

  it('describes the calendar version and the real archive name', () => {
    expect(embedReadme).not.toContain('0.13.x');
    expect(embedReadme).not.toMatch(/[^-]open-calc-studio-<version>\.tgz/);
    expect(embedReadme).toContain('openaec-open-calc-studio-<version>.tgz');
    expect(read('.github/workflows/build.yml')).not.toMatch(/`open-calc-studio-<version>\.tgz`/);
  });
});

/** GitHub-anker van een Markdown-kop: kleine letters, leestekens weg, spaties → '-'. */
const anchor = (heading: string) => heading.trim().toLowerCase().replace(/[^\p{L}\p{N} _-]/gu, '').replace(/ /g, '-');
const userGuides = ['docs/user-guide.md', 'docs/gebruikershandleiding.md', 'wiki/Gebruikershandleiding.md'];

describe('user guides (knownbugs 230, 231, 234, 237)', () => {
  it('do not promise an autosave that the app does not have (230)', async () => {
    const { defaultSettings } = await import('@/utils/settings');
    // Er is geen schakelaar en standaard staat het uit; de handleidingen mogen dus geen timer beloven.
    expect(defaultSettings.autoSave).toBe(false);
    for (const file of userGuides) {
      const text = read(file);
      expect(text, file).not.toMatch(/every two minutes|iedere twee minuten/);
      expect(text, file).not.toMatch(/Autosave (to an existing file|naar het bestaande bestand) (follows|volgt)/);
    }
  });

  it('do not call XPWE/XC4 unsupported outside MCP (231)', () => {
    for (const file of ['docs/wereldwijde-uitwisseling.md', 'wiki/Bestandsuitwisseling.md']) {
      const text = read(file);
      expect(text, file).not.toMatch(/DCF\/XPWE/);
      expect(text, file).toMatch(/XPWE/);
      expect(text, file).toMatch(/XC4/);
    }
    expect(read('wiki/MCP-server.md')).toMatch(/XPWE\/XC4 import en export werken alleen in de app/);
  });

  it('do not say that every import command depends on extensions (234)', () => {
    for (const file of userGuides) {
      const text = read(file);
      expect(text, file).not.toContain('Import commands depend on enabled extensions');
      expect(text, file).not.toContain('Controleer Bestand → Extensies als een importer ontbreekt');
    }
  });

  it('link to README anchors that exist (237)', () => {
    const headings = new Set(read('README.md').split(/\r?\n/).filter((l) => /^#{1,6} /.test(l)).map((l) => anchor(l.replace(/^#+ /, ''))));
    const links = [...read('docs/user-guide.md').matchAll(/\(\.\.\/README\.md#([^)]+)\)/g)].map((m) => m[1]);
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(headings, link).toContain(link);
  });
});
