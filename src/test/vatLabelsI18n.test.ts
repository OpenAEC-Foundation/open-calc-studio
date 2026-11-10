import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Issue #65: de belastingnaam (IVA, MwSt., TVA, VAT, ...) moet in elke taal
// bestaan en mag buiten het Engels niet stil de Engelse tekst zijn.

const dir = join(__dirname, '..', 'i18n', 'locales');
const read = (lang: string) => JSON.parse(readFileSync(join(dir, lang, 'common.json'), 'utf8'));
const en = read('en');

describe('btw-namen per taal', () => {
  const langs = readdirSync(dir).filter(l => l !== 'en');

  it.each(langs)('%s: lage en hoge btw zijn vertaald', (lang) => {
    const d = read(lang).workspace.defaults;
    for (const key of ['vatLow', 'vatHigh'] as const) {
      expect(typeof d[key]).toBe('string');
      expect(d[key].trim()).not.toBe('');
      expect(d[key]).not.toBe(en.workspace.defaults[key]);
    }
  });

  it.each(langs)('%s: valutakeuze heeft een eigen tekst', (lang) => {
    const p = read(lang).projectInfo;
    expect(p.currency.trim()).not.toBe('');
    expect(p.currencyHelp).not.toBe(en.projectInfo.currencyHelp);
  });
});
