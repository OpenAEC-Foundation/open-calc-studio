import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { importOnlv } from '@/services/importers/onlvImporter';
import { recalculateItems, getKostprijs } from '@/services/calculation/calculator';
import { COST_UNITS } from '@/components/grid/gridConstants';
import type { ImportResult } from '@/services/importers/types';

/**
 * Echte ÖNORM A 2063-Leistungsbücher: het kleine demo-LB `LB-SCHOKO_V2021.onlb`
 * (kopie in verification/onorm-a2063/) en — als de map naast de repo bestaat —
 * de standaard-LB's van het Oostenrijkse ministerie (LB-Hochbau 023 en
 * LB-Haustechnik 014, in de schemaversies 2015 en 2021). De aantallen worden
 * tegen het ruwe XML geteld, zodat de test niet op de importer zelf leunt.
 */

const REPO_DIR = path.resolve(process.cwd(), 'verification', 'onorm-a2063');
const EXT_DIR = process.env.A2063_DIR ?? path.resolve(process.cwd(), '..', 'verification-files', 'Begrotingen', 'ONORM-A2063');

const SCHOKO = path.join(REPO_DIR, 'LB-SCHOKO_V2021.onlb');
const EXTERNAL = [
  'LB-HB-023-2021/LB-HB-023-2021.onlb',
  'LB-HB-023-2015/LB-HB-023-2015.onlb',
  'LB-HT-014-2021/LB-HT-014-2021.onlb',
  'LB-HT-014-2015/LB-HT-014-2015.onlb',
].map((f) => path.join(EXT_DIR, f)).filter((f) => existsSync(f));

/**
 * Elementen tellen in de ruwe tekst (onafhankelijk van de importer). Groepen
 * en posities hebben een nr-/ftnr-attribuut of staan als los element; de
 * gelijknamige verwijzingen `<lg>01</lg>` in aenderungskennzeichnungen
 * tellen zo niet mee.
 */
const count = (xml: string, tag: string): number => {
  const re = tag === 'lg' || tag === 'ulg' ? new RegExp(`<${tag} nr="`, 'g') : new RegExp(`<${tag}[ >/]`, 'g');
  return (xml.match(re) ?? []).length;
};

const knownUnits = new Set<string>(COST_UNITS);

describe.skipIf(!existsSync(SCHOKO))('ÖNORM A 2063 — LB-SCHOKO_V2021.onlb (demo-Leistungsbuch)', () => {
  const xml = existsSync(SCHOKO) ? readFileSync(SCHOKO, 'utf-8') : '';
  const res: ImportResult = xml ? importOnlv(xml) : { schedule: {}, items: [], warnings: [] };

  it('leest kenndaten, 1 lg, 2 ulg en 5 folgepositionen', () => {
    expect(res.schedule.projectName).toBe('Schokolade');
    expect(res.schedule.projectNumber).toBe('SCHOKO-2');
    // De herausgeber (firma/name) uit het bestand zelf, zodat de test niet op een naam leunt.
    expect(res.schedule.author).toBe(/<herausgeber>\s*<firma>\s*<name>([^<]+)<\/name>/.exec(xml)?.[1]);
    expect(res.schedule.author).not.toBe('');
    expect(res.schedule.description).toContain('Ständige Vorbemerkung für Schokolade');
    expect(res.items.filter((i) => i.rowType === 'chapter')).toHaveLength(count(xml, 'lg') + count(xml, 'ulg'));
    expect(res.items.filter((i) => i.rowType === 'begrotingspost')).toHaveLength(count(xml, 'folgeposition'));
    expect(res.items.map((i) => i.code)).toEqual(['01', '01', '01.01.01A', '01.01.01B', '01.01.01C', '02', '01.02.01A', '01.02.01B']);
  });

  it('heeft overal een omschrijving, hoeveelheid 0, eenheid kg en geen prijzen', () => {
    for (const it of res.items) expect(it.description, it.code).not.toBe('');
    const posts = res.items.filter((i) => i.rowType === 'begrotingspost');
    expect(posts.every((p) => p.quantity === 0 && p.unit === 'kg')).toBe(true);
    expect(getKostprijs(recalculateItems(res.items))).toBe(0);
    expect(res.warningCodes?.map((c) => c.code)).toEqual(['leistungsbuch', 'luecken']);
  });

  it('zet Bieter-/Ausschreiberlücken om in ____ en Rechenwerte in hun waarde', () => {
    const chilli = res.items.find((i) => i.code === '01.01.01A')!;
    expect(chilli.notes).toBe([
      'Trinkschokolade: Variation Klassik', 'Bird´s Eye Chili', 'Nährwert: ____', 'Verpackungsgröße:____',
      'Enthält Soja: ____', 'Angebotenes Erzeugnis: ____', 'Beschreibung: ____',
    ].join('\n'));
    const vollmilch = res.items.find((i) => i.code === '01.02.01A')!;
    expect(vollmilch.notes.split('\n')[1]).toBe('Kakaoanteil 40');
    expect(res.items.find((i) => i.code === '01')!.notes).toMatch(/^Als Trinkschokolade/);
  });
});

describe.skipIf(EXTERNAL.length === 0)('ÖNORM A 2063 — standaard-Leistungsbücher (BMWET)', () => {
  const results = new Map<string, { res: ImportResult; ms: number; xml: string }>();
  const load = (file: string) => {
    let entry = results.get(file);
    if (!entry) {
      const xml = readFileSync(file, 'utf-8');
      const t0 = performance.now();
      const res = importOnlv(xml);
      entry = { res, ms: performance.now() - t0, xml };
      results.set(file, entry);
    }
    return entry;
  };

  for (const file of EXTERNAL) {
    describe(path.basename(file), () => {
      it('importeert alle lg/ulg als hoofdstukken en alle posities in minder dan 5 s', () => {
        const { res, ms, xml } = load(file);
        const chapters = res.items.filter((i) => i.rowType === 'chapter').length;
        const positions = res.items.filter((i) => i.rowType === 'begrotingspost' || i.rowType === 'tekstregel').length;
        expect(chapters).toBe(count(xml, 'lg') + count(xml, 'ulg'));
        expect(positions).toBe(count(xml, 'folgeposition') + count(xml, 'ungeteilteposition'));
        // Wählbare Vorbemerkungen (zonder einheit) worden tekstregels; de rest posten.
        expect(res.items.filter((i) => i.rowType === 'begrotingspost')).toHaveLength(count(xml, 'einheit'));
        expect(ms, `import duurde ${ms.toFixed(0)} ms`).toBeLessThan(5000);
      });

      it('heeft nergens een lege omschrijving of code en alle posities op hoeveelheid 0', () => {
        const { res } = load(file);
        expect(res.items.filter((i) => !i.description)).toHaveLength(0);
        expect(res.items.filter((i) => !i.code)).toHaveLength(0);
        expect(res.items.filter((i) => i.rowType === 'begrotingspost' && i.quantity !== 0)).toHaveLength(0);
        expect(res.warningCodes?.[0]?.code).toBe('leistungsbuch');
      });

      it('herkent elke eenheid of meldt hem als onbekend', () => {
        const { res } = load(file);
        const unknown = res.warningCodes?.find((c) => c.code === 'unknownUnit');
        const reported = new Set(String(unknown?.params?.examples ?? '').split(', ').filter(Boolean));
        for (const it of res.items) {
          if (it.rowType !== 'begrotingspost') continue;
          expect(knownUnits.has(it.unit) || reported.has(it.unit), `eenheid ${it.unit} (${it.code})`).toBe(true);
        }
      });

      it('heeft unieke positienummers op het ÖNORM-patroon', () => {
        const { res } = load(file);
        const codes = res.items.filter((i) => i.rowType !== 'chapter').map((i) => i.code);
        expect(new Set(codes).size).toBe(codes.length);
        expect(codes.every((c) => /^\d{2}\.\d{2}\.\d{2}[A-Z]?$/.test(c)), codes.find((c) => !/^\d{2}\.\d{2}\.\d{2}[A-Z]?$/.test(c))).toBe(true);
      });
    });
  }

  const pairs = [['LB-HB-023-2021', 'LB-HB-023-2015'], ['LB-HT-014-2021', 'LB-HT-014-2015']]
    .map(([a, b]) => [EXTERNAL.find((f) => f.includes(a)), EXTERNAL.find((f) => f.includes(b))] as const)
    .filter(([a, b]) => a && b) as [string, string][];

  it.skipIf(pairs.length === 0)('leest de schemaversies 2015 en 2021 van dezelfde LB identiek', () => {
    for (const [a, b] of pairs) {
      const A = load(a).res.items.map((i) => `${i.rowType}|${i.code}|${i.description}|${i.unit}|${i.notes}`);
      const B = load(b).res.items.map((i) => `${i.rowType}|${i.code}|${i.description}|${i.unit}|${i.notes}`);
      expect(B, `${path.basename(a)} vs ${path.basename(b)}`).toEqual(A);
    }
  });
});
