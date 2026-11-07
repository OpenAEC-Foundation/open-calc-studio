import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { LANGUAGES } from '@/i18n/config';

/**
 * Elke taal moet dezelfde sleutels hebben als Engels (de fallback). Een
 * ontbrekende sleutel valt stil terug op Engels, dus niemand merkt het in de
 * app; deze test wel. Voeg je een tekst toe in en/nl, vertaal hem dan in alle
 * talen (zie scripts rond de vertaalronde) in dezelfde commit.
 */

const localesDir = join(process.cwd(), 'src', 'i18n', 'locales');
const namespaces = readdirSync(join(localesDir, 'en')).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));
const languages = readdirSync(localesDir).filter((l) => l !== 'en');

function flatten(obj: Record<string, unknown>, prefix = '', out: Record<string, string> = {}): Record<string, string> {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') flatten(v as Record<string, unknown>, key, out);
    else out[key] = String(v);
  }
  return out;
}

function load(lang: string, ns: string): Record<string, string> | null {
  const file = join(localesDir, lang, `${ns}.json`);
  if (!existsSync(file)) return null;
  return flatten(JSON.parse(readFileSync(file, 'utf8')));
}

/** Interpolaties, $t-verwijzingen en Trans-tags uit het Engels moeten in de vertaling terugkomen (extra mag: nl gebruikt soms een meervoudssuffix). */
function placeholders(text: string): string[] {
  return text.match(/\{\{[^}]+\}\}|<\/?[0-9a-z]+>|\$t\([^)]*\)/g) ?? [];
}
function keepsPlaceholders(en: string, translated: string): boolean {
  const have = placeholders(translated);
  return placeholders(en).every((p) => have.includes(p));
}

const english = Object.fromEntries(namespaces.map((ns) => [ns, load('en', ns)!]));

describe('locale parity', () => {
  it('every language in the language list has a locale folder, and vice versa', () => {
    const listed = LANGUAGES.map((l) => l.code).filter((c) => c !== 'auto').sort();
    expect([...languages, 'en'].sort()).toEqual(listed);
  });

  it.each(languages)('%s has every English key', (lang) => {
    const missing: string[] = [];
    for (const ns of namespaces) {
      const own = load(lang, ns) ?? {};
      for (const key of Object.keys(english[ns])) if (!(key in own)) missing.push(`${ns}:${key}`);
    }
    expect(missing, `${missing.length} ontbrekende sleutels, eerste: ${missing.slice(0, 5).join(', ')}`).toEqual([]);
  });

  it.each(languages)('%s keeps the placeholders of every string', (lang) => {
    const wrong: string[] = [];
    for (const ns of namespaces) {
      const own = load(lang, ns) ?? {};
      for (const [key, en] of Object.entries(english[ns])) {
        if (key in own && !keepsPlaceholders(en, own[key])) wrong.push(`${ns}:${key} -> ${own[key]}`);
      }
    }
    expect(wrong, wrong.slice(0, 5).join('\n')).toEqual([]);
  });
});
