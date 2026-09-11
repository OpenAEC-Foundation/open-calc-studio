import { describe, it, expect, beforeAll } from 'vitest';
import i18next, { type TFunction } from 'i18next';
import { formatUnit } from '@/i18n/formatUnit';
import { describeImportWarnings } from '@/components/common/ImportWarningsDialog';
import { COST_UNITS } from '@/components/grid/gridConstants';
import { importBc3, importBc3File } from '@/services/importers/bc3Importer';
import { buildBc3, encodeWindows1252 } from '@/services/export/bc3Exporter';
import { makeCostItem } from '@/services/importers/core';
import { recalculateItems } from '@/services/calculation/calculator';
import type { CostSchedule, CostUnit } from '@/types/costModel';
import enUnits from '@/i18n/locales/en/units.json';
import nlUnits from '@/i18n/locales/nl/units.json';
import enDialogs from '@/i18n/locales/en/dialogs.json';
import nlDialogs from '@/i18n/locales/nl/dialogs.json';

/**
 * Eenheden zijn Nederlandse opslagcodes ('uur', 'st', …). De UI toont ze
 * vertaald via formatUnit, maar bestanden en import/export houden de code.
 */

let tEn: TFunction;
let tNl: TFunction;
/** Een taal zonder eigen vertalingen en zonder terugval. */
let tBare: TFunction;

beforeAll(async () => {
  const inst = i18next.createInstance();
  await inst.init({
    lng: 'en',
    fallbackLng: 'en',
    ns: ['units', 'dialogs'],
    defaultNS: 'dialogs',
    resources: {
      en: { units: enUnits, dialogs: enDialogs },
      nl: { units: nlUnits, dialogs: nlDialogs },
    },
    interpolation: { escapeValue: false },
  });
  tEn = inst.getFixedT('en');
  tNl = inst.getFixedT('nl');

  const bare = i18next.createInstance();
  await bare.init({ lng: 'xx', fallbackLng: false, resources: { xx: { units: {}, dialogs: {} } }, interpolation: { escapeValue: false } });
  tBare = bare.getFixedT('xx');
});

const EXPECTED_EN: Record<CostUnit, string> = {
  st: 'pcs', m: 'm', 'm²': 'm²', 'm³': 'm³', kg: 'kg', ton: 'ton', uur: 'h', dgn: 'days',
  km: 'km', keer: 'times', ls: 'LS', week: 'wk', mnd: 'mo', post: 'item', '%': '%', pm: 'PM',
};

describe('formatUnit', () => {
  it('units.json (en/nl) heeft exact de CostUnit-codes als keys', () => {
    const codes = [...COST_UNITS].sort();
    expect(Object.keys(enUnits).sort()).toEqual(codes);
    expect(Object.keys(nlUnits).sort()).toEqual(codes);
  });

  it('vertaalt elke code naar de Engelse korte vorm', () => {
    for (const code of COST_UNITS) {
      expect(formatUnit(code, tEn)).toBe(EXPECTED_EN[code]);
    }
  });

  it('toont in het Nederlands de code zelf', () => {
    for (const code of COST_UNITS) {
      expect(formatUnit(code, tNl)).toBe(code);
    }
  });

  it('laat onbekende codes, lege waarden en codes met punt/dubbele punt heel', () => {
    expect(formatUnit('stuks', tEn)).toBe('stuks');
    expect(formatUnit('m.1', tEn)).toBe('m.1');
    expect(formatUnit('a:b', tEn)).toBe('a:b');
    expect(formatUnit('', tEn)).toBe('');
    expect(formatUnit(null, tEn)).toBe('');
    expect(formatUnit(undefined)).toBe('');
  });

  it('valt terug op de code als er geen vertaling is', () => {
    expect(formatUnit('uur', tBare)).toBe('uur');
  });

  it('crasht niet zonder geïnitialiseerde i18next en toont dan de code', () => {
    expect(formatUnit('uur')).toBe('uur');
  });
});

describe('opslagformaat van eenheden blijft de code', () => {
  const schedule = { name: 'Eenheden', projectName: 'Eenheden' } as CostSchedule;

  /** Eén hoofdstuk met per CostUnit een post, plus een rekenregel in uren. */
  const buildItems = () => {
    const chapter = makeCostItem({ rowType: 'chapter', code: 'H1', description: 'Hoofdstuk', depth: 0, sortOrder: 0 });
    const items = [chapter];
    COST_UNITS.forEach((unit, i) => {
      items.push(makeCostItem({
        rowType: 'begrotingspost', parentId: chapter.id, depth: 1, sortOrder: items.length,
        code: `P${String(i + 1).padStart(2, '0')}`, description: `Post ${unit}`,
        unit, quantity: 2, normUnitPrice: 10,
      }));
    });
    const metRegel = makeCostItem({
      rowType: 'begrotingspost', parentId: chapter.id, depth: 1, sortOrder: items.length,
      code: 'PR', description: 'Post met regel', unit: 'm²', quantity: 3,
    });
    items.push(metRegel);
    items.push(makeCostItem({
      rowType: 'regel', parentId: metRegel.id, depth: 2, sortOrder: items.length,
      code: 'MO', description: 'Arbeid', unit: 'uur', resourceType: 'arbeid',
      quantity: 3, normQuantity: 0.5, normFactor: 1, normUnitPrice: 40,
    }));
    return recalculateItems(items);
  };

  it('bc3-round-trip (Windows-1252-bytes) laat elke eenheid ongewijzigd', () => {
    const items = buildItems();
    const text = buildBc3(schedule, items);
    // Het bestand bevat de codes, niet de weergavevorm.
    expect(text).toContain('|uur|');
    expect(text).not.toMatch(/~C\|MO\|h\|/);

    const bytes = encodeWindows1252(text);
    const back = importBc3File(bytes.buffer as ArrayBuffer);
    const byCode = new Map(back.items.map((i) => [i.code, i]));
    for (const orig of items) {
      if (orig.rowType === 'chapter') continue;
      const re = byCode.get(orig.code);
      expect(re, orig.code).toBeDefined();
      expect(re!.unit, `eenheid van ${orig.code}`).toBe(orig.unit);
    }
  });

  it('formatUnit vertaalt voor weergave, maar de opgeslagen code verandert niet', () => {
    // Spaanse 'h' wordt bij import de code 'uur' …
    const sample = [
      '~V||FIEBDC-3/2004|TestSoft||ANSI|||||',
      '~C|PROY##||Proyecto|15.50||0|',
      '~C|CAP01#||Capítulo|15.50||0|',
      '~C|PART1|ud|Partida|15.50||0|',
      '~C|MO001|h|Peón|15.50||1|',
      '~D|PROY##|CAP01#\\1\\1\\|',
      '~D|CAP01#|PART1\\1\\1\\|',
      '~D|PART1|MO001\\1\\1\\|',
      '~M|CAP01#\\PART1||1.00||',
    ].join('\r\n');
    const first = recalculateItems(importBc3(sample).items);
    const mo = first.find((i) => i.code === 'MO001')!;
    expect(mo.unit).toBe('uur');
    // … die in het Engels als 'h' getoond wordt, zonder het item te wijzigen …
    expect(formatUnit(mo.unit, tEn)).toBe('h');
    expect(mo.unit).toBe('uur');
    // … en bij export/herimport gewoon 'uur' blijft.
    const again = importBc3(buildBc3(schedule, first)).items;
    expect(again.find((i) => i.code === 'MO001')!.unit).toBe('uur');
    expect(again.find((i) => i.code === 'PART1')!.unit).toBe('st');
  });
});

describe('importmeldingen (FIEBDC-3) — codes naast tekst', () => {
  const NO_PRICES = [
    '~V||FIEBDC-3/2004|TestSoft||ANSI|||||',
    '~C|PROY##||Mediciones|||0|',
    '~C|CAP01#||Capítulo 1|||0|',
    '~C|P1|m2|Solado|||0|',
    '~D|PROY##|CAP01#\\1\\1\\|',
    '~D|CAP01#|P1\\1\\1\\|',
    '~M|CAP01#\\P1||12.5||',
  ].join('\r\n');

  it('vult warningCodes parallel aan de (Nederlandse) warnings', () => {
    const res = importBc3(NO_PRICES);
    expect(res.warnings.some((w) => w.includes('geen prijzen'))).toBe(true);
    expect(res.warningCodes).toBeDefined();
    expect(res.warningCodes!).toHaveLength(res.warnings.length);
    expect(res.warningCodes!.map((c) => c.code)).toContain('noPrices');
  });

  it('vertaalt de codes in de dialoog; Nederlands = de oorspronkelijke tekst', () => {
    const res = importBc3(NO_PRICES);
    const en = describeImportWarnings(res, tEn);
    const nl = describeImportWarnings(res, tNl);
    const i = res.warningCodes!.findIndex((c) => c.code === 'noPrices');
    expect(en[i]).toMatch(/contains no prices/);
    expect(nl[i]).toBe(res.warnings[i]);
  });

  it('interpoleert parameters en gebruikt de tekst als terugval zonder vertaling', () => {
    const src = [
      '~V||FIEBDC-3/2004|TestSoft||ANSI|||||',
      '~C|PROY##||Proyecto|10||0|',
      '~C|CAP01#||Capítulo|10||0|',
      '~C|P1|m2|Solado|10||0|',
      '~D|PROY##|CAP01#\\1\\1\\|',
      '~D|CAP01#|P1\\1\\1\\ONBEKEND\\1\\1\\|',
      '~M|CAP01#\\P1||1||',
    ].join('\r\n');
    const res = importBc3(src);
    const i = res.warningCodes!.findIndex((c) => c.code === 'unknownConceptUnder');
    expect(i).toBeGreaterThanOrEqual(0);
    expect(res.warningCodes![i].params).toEqual({ concept: 'ONBEKEND', parent: 'CAP01#' });
    expect(describeImportWarnings(res, tEn)[i]).toBe("Unknown concept 'ONBEKEND' under 'CAP01#' — skipped.");
    expect(describeImportWarnings(res, tNl)[i]).toBe(res.warnings[i]);
    // Geen vertaling beschikbaar → de Nederlandse tekst van de importer.
    expect(describeImportWarnings(res, tBare)[i]).toBe(res.warnings[i]);
  });

  it('meldingen zonder codes (andere importers) blijven letterlijk staan', () => {
    const lines = describeImportWarnings({ warnings: ['RSX bevat geen besteksposten.'], format: 'rsx' }, tEn);
    expect(lines).toEqual(['RSX bevat geen besteksposten.']);
  });

  it('elke bc3-code heeft een en- en nl-vertaling', () => {
    const codes = [
      'unknownConceptInDecomposition', 'unknownConceptUnder', 'zeroYieldDecomposition',
      'noRootStructure', 'noProjectStructure', 'priceMismatch', 'noPrices', 'moreWarnings',
    ];
    const has = (bundle: Record<string, string>, code: string) =>
      code in bundle || (`${code}_one` in bundle && `${code}_other` in bundle);
    for (const code of codes) {
      expect(has(enDialogs.importWarnings.bc3 as Record<string, string>, code), `en ${code}`).toBe(true);
      expect(has(nlDialogs.importWarnings.bc3 as Record<string, string>, code), `nl ${code}`).toBe(true);
    }
  });
});
