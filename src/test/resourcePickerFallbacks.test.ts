import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * De Engelse terugvalteksten in ResourcePicker verschijnen als i18n niet klaar is
 * (headless/embed). Ze moeten gelijk zijn aan en/common.json, anders komt een oude
 * term terug, zoals "budget post" na de hernoeming naar "estimate item" (knownbug 243).
 */
describe('ResourcePicker English fallbacks', () => {
  it('match the English locale values', () => {
    const source = readFileSync(join(process.cwd(), 'src/components/library/ResourcePicker.tsx'), 'utf8');
    const en = JSON.parse(readFileSync(join(process.cwd(), 'src/i18n/locales/en/common.json'), 'utf8'));
    const calls = [...source.matchAll(/uiText\(\s*(['"])([\w.]+)\1\s*,\s*(['"])((?:(?!\3)[^\\]|\\.)*)\3/g)];
    expect(calls.length).toBeGreaterThan(5);
    const drift = calls
      .map(([, , key, , fallback]) => ({ key, fallback, english: key.split('.').reduce((node, part) => node?.[part], en.workspace) }))
      .filter(({ fallback, english }) => fallback !== english);
    expect(drift).toEqual([]);
  });
});
