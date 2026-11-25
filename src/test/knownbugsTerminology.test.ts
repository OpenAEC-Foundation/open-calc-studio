import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Vaktermen in de vertalingen (knownbugs 240-248). Engels is de terugval voor
 * honderden sleutels in andere talen, dus een verkeerde Engelse term zien veel
 * gebruikers.
 */
const dir = join(process.cwd(), 'src', 'i18n', 'locales');
const text = (lang: string, key: string): string => {
  const [ns, path] = key.split(':');
  const value = path.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part],
    JSON.parse(readFileSync(join(dir, lang, `${ns}.json`), 'utf8')));
  expect(typeof value, `${lang}:${key}`).toBe('string');
  return value as string;
};

describe('calculation line, not calculation rule (knownbug 240)', () => {
  const keys = ['common:calculationRule', 'common:newCalculationRule', 'ribbon:home.calculationRule', 'common:propertiesPanel.types.regel',
    'common:mobile.addRule', 'common:mobile.searchItems', 'common:mobile.noItems', 'common:tooltip.unitPriceSumRules', 'common:tooltip.totalSumRules'];
  it('English says "line"', () => {
    for (const key of keys) {
      expect(text('en', key), key).not.toMatch(/\brules?\b/i);
      expect(text('en', key), key).toMatch(/\blines?\b/i);
    }
    expect(text('en', 'common:calculationRule')).toBe('Calculation line');
  });
  it('Lao uses its existing word for a calculation line, not "formula" or "rule"', () => {
    for (const key of keys) {
      expect(text('lo', key), key).not.toMatch(/ສູດຄິດໄລ່|ກົດເກນ|ຫຼັກການຄິດໄລ່/);
      expect(text('lo', key), key).toContain('ແຖວຄິດໄລ່');
    }
  });
});

describe('markups, not tail (knownbug 241)', () => {
  const keys = ['common:wpcalc.tabTail', 'common:wpcalc.tabHoursTail', 'common:wpcalc.tailCosts', 'common:surcharges', 'common:propertiesPanel.types.staart'];
  const tail: Record<string, RegExp> = { en: /\btail/i, sw: /mkia/i, vi: /đuôi/i, th: /ส่วนท้าย/, lo: /ສ່ວນທ້າຍ|ທ້າຍຕາຕະລາງ/ };
  it.each(Object.keys(tail))('%s follows report:staart.title', (lang) => {
    // Engels: "Markup line" (enkelvoud) voor de staartregel.
    const markups = lang === 'en' ? 'markup' : text(lang, 'report:staart.title').toLowerCase();
    for (const key of keys) {
      expect(text(lang, key), key).not.toMatch(tail[lang]);
      expect(text(lang, key).toLowerCase(), key).toContain(markups);
    }
  });
  it('English names the tab "Hours & Markups", as the user guide does', () => {
    expect(text('en', 'common:wpcalc.tabHoursTail')).toBe('Hours & Markups');
  });
});

describe('FR rounding step (knownbug 242)', () => {
  it('does not read as "no rounding"', () => {
    expect(text('fr', 'grid:staart.roundingStepTitle')).not.toMatch(/^Pas d'arrondi/);
    expect(text('fr', 'grid:undo.roundingStep')).toBe("Incrément d'arrondi");
    expect(text('fr', 'grid:staart.roundingNone')).toBe("pas d'arrondi");
  });
});

describe('estimate and monitoring items (knownbug 243)', () => {
  it('English uses the same words as elsewhere in the app', () => {
    for (const key of ['common:budgetPost', 'ribbon:home.budgetPost', 'common:propertiesPanel.types.begrotingspost']) expect(text('en', key), key).toBe('Estimate item');
    for (const key of ['common:monitorPost', 'ribbon:home.monitorPost', 'common:propertiesPanel.types.bewakingspost']) expect(text('en', key), key).toBe('Monitoring item');
    expect(text('en', 'common:newBudgetPost')).toBe('New estimate item');
    expect(text('en', 'common:newMonitorPost')).toBe('New monitoring item');
    expect(text('en', 'common:tooltip.totalSumMonitorPosts')).not.toMatch(/monitor post/);
    expect(text('en', 'common:workspace.pricing.addToNew')).not.toMatch(/budget post/);
  });
});

describe('MS: SST instead of the abolished GST (knownbug 244)', () => {
  it('no Malay text mentions GST', () => {
    for (const ns of ['common', 'grid', 'report', 'releases']) {
      expect(readFileSync(join(dir, 'ms', `${ns}.json`), 'utf8'), ns).not.toMatch(/\bGST\b/);
    }
    expect(text('ms', 'report:offerte.inclVatNote')).toContain('SST');
  });
});

describe('payment schedule (knownbug 245)', () => {
  it('DE and PL use the payment-plan word they already use elsewhere', () => {
    expect(text('de', 'ribbon:offerte.termijnen')).toBe(text('de', 'common:workspace.quotationDefaults.payments'));
    expect(text('pl', 'ribbon:offerte.termijnen')).toBe(text('pl', 'common:workspace.quotationDefaults.payments'));
  });
});

describe('tender schedule export (knownbug 246)', () => {
  it('English does not use the Dutch word, Lao is consistent', () => {
    for (const ns of ['common', 'backstage']) expect(text('en', `${ns}:exportInschrijfstaat`)).toBe('Export tender schedule (.xlsx)');
    expect(text('lo', 'backstage:exportInschrijfstaat')).toBe(text('lo', 'common:exportInschrijfstaat'));
  });
});

describe('reporting group label (knownbug 247)', () => {
  it.each(['cs', 'sk'])('%s is translated', (lang) => {
    expect(text(lang, 'ribbon:rapportage.reporting')).not.toBe('Reporting');
  });
});

describe('NL variant column (knownbug 248)', () => {
  it('is called Variant', () => {
    expect(text('nl', 'grid:columns.branch')).toBe('Variant');
  });
});
