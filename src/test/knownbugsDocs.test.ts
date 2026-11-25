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
