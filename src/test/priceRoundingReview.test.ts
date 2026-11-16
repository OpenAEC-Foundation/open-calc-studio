import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { makeCostItem } from '@/services/importers/core';
import {
  recalculateItems, getKostprijs, computeKostprijsBreakdown, computeBtwLaagDirect,
} from '@/services/calculation/calculator';
import { normalizePriceRounding, roundHalfUp } from '@/services/calculation/priceRounding';
import { serializeProject, deserializeProject } from '@/services/file/fileService';
import { variantCalculatedItems } from '@/services/grid/variantTotals';
import { createDefaultSchedule } from '@/data/defaultBudget';
import { useAppStore } from '@/state/appStore';
import type { CostItem, PriceRounding } from '@/types/costModel';

/**
 * Onafhankelijke review van de prijsafronding (#83). Tests met `it.fails`
 * leggen een gevonden gebrek vast: ze slagen zolang het gebrek bestaat en
 * gaan rood zodra het is opgelost (haal `.fails` dan weg).
 */

const R2: PriceRounding = { line: 2, unitPrice: 2, total: 2 };
const TAR = { A: 64, B: 43.5 };
let n = 0;
const mk = (rowType: CostItem['rowType'], parentId: string | null, p: Partial<CostItem> = {}): CostItem =>
  makeCostItem({ id: `i${++n}`, ifcGuid: `g${n}`, rowType, parentId, ...p });
const byId = (items: CostItem[], id: string) => items.find(i => i.id === id)!;
const sum = (xs: number[]) => xs.reduce((s, v) => s + v, 0);
const kolomSom = (items: CostItem[]) => {
  const k = computeKostprijsBreakdown(items);
  return k.loon + k.materiaal + k.materieel + k.stelpost + k.onderaanneming;
};

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

/** Willekeurige begroting: alle rekenmodellen, geneste posten, lege hoofdstukken, staart. */
function fuzzBudget(seed: number): CostItem[] {
  n = 0;
  const r = rng(seed);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const num = (max: number, dec: number) => Math.round(r() * max * 10 ** dec) / 10 ** dec;
  const items: CostItem[] = [];
  const addPost = (parent: string | null, depth: number) => {
    const kind = pick(['begrotingspost', 'begrotingspost', 'bewakingspost'] as const);
    const post = mk(kind, parent, {
      quantity: pick([null, 0, 1, num(200, 3), -num(20, 2)]),
      normUnitPrice: pick([null, null, num(50, 3)]), materialPrice: pick([null, null, num(50, 2)]), laborPrice: pick([null, null, num(50, 2)]),
      btwTarief: pick([undefined, undefined, 'laag', 'hoog']) as never,
    });
    items.push(post);
    const kids = Math.floor(r() * 5);
    for (let k = 0; k < kids; k++) {
      const t = r();
      if (t < 0.1) items.push(mk('tekstregel', post.id));
      else if (t < 0.2 && depth < 3) addPost(post.id, depth + 1);
      else {
        const model = pick(['ui1', 'wp', 'direct', 'tarief', 'empty']);
        items.push(mk('regel', post.id, {
          quantity: pick([post.quantity, post.quantity, num(50, 2), null]),
          resourceType: pick([null, 'arbeid', 'materiaal', 'materieel', 'onderaannemer', 'overig']) as never,
          ...(model === 'ui1' ? { normQuantity: num(3, 3), normFactor: pick([null, 1, 2, 0]), normUnitPrice: num(90, 2) } : {}),
          ...(model === 'wp' ? { normQuantity: pick([0, null, num(2, 2)]), normUnitPrice: num(90, 2), laborPrice: num(40, 3) } : {}),
          ...(model === 'direct' ? { normUnitPrice: pick([num(900, 2), -num(90, 2)]) } : {}),
          ...(model === 'tarief' ? { normQuantity: num(2, 3), tariefGroep: pick(['A', 'B', 'X']) as never, normUnitPrice: pick([null, num(20, 2)]) } : {}),
        }));
      }
    }
  };
  const chapters = 1 + Math.floor(r() * 3);
  for (let c = 0; c < chapters; c++) {
    const ch = mk('chapter', null, { code: String(c + 1), btwTarief: pick([undefined, 'laag']) as never });
    items.push(ch);
    const sub = r() < 0.4 ? mk('chapter', ch.id) : null;
    if (sub) items.push(sub);
    const posts = Math.floor(r() * 4);
    for (let p = 0; p < posts; p++) addPost(pick([ch.id, sub?.id ?? ch.id]), 0);
  }
  if (r() < 0.3) addPost(null, 0);
  if (r() < 0.8) {
    const bouw1 = ['staart_ak_oa', 'staart_abk', 'staart_garanties', 'staart_wvpm', 'staart_risico', 'staart_winst', 'staart_verzekering', 'staart_btw_laag', 'staart_btw', 'staart_afronding'] as const;
    const legacy = ['staart_ukk', 'staart_ak', 'staart_wr', 'staart_afronding'] as const;
    for (const t of (r() < 0.7 ? bouw1 : legacy)) {
      items.push(mk(t, null, { staartPercentage: num(20, 1), ...(t === 'staart_afronding' ? { staartAfrondingStap: pick([undefined, 0, 10, 0.05]) } : {}) } as never));
    }
  }
  return items;
}

/** FNV-1a over de bedragen, zodat een gouden waarde het gedrag zonder regel vastlegt. */
function fingerprint(seeds: number, calc: (items: CostItem[], tar?: Record<string, number>) => CostItem[]): string {
  let h = 0x811c9dc5;
  for (let seed = 1; seed <= seeds; seed++) {
    for (const tar of [undefined, TAR]) {
      const out = calc(fuzzBudget(seed), tar);
      const text = JSON.stringify(out.map(i => [i.id, i.nr, i.total, i.unitPrice, i.laborPrice, i.staartItemBreakdown ?? null]));
      for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    }
  }
  return h.toString(16);
}

/** De CYPE-post uit #83 als items: 93,732 m² met vier regels. */
function cypePost(extra: Partial<CostItem> = {}) {
  n = 0;
  const ch = mk('chapter', null, { code: '01' });
  const post = mk('begrotingspost', ch.id, { quantity: 93.732, unit: 'm2' as never, ...extra });
  const q = post.quantity;
  const regels = [
    mk('regel', post.id, { quantity: q, normQuantity: 0.7, normFactor: 1, normUnitPrice: 18.35, resourceType: 'arbeid' }),
    mk('regel', post.id, { quantity: q, normQuantity: 0.7, normFactor: 1, normUnitPrice: 17.08, resourceType: 'arbeid' }),
    mk('regel', post.id, { quantity: q, normQuantity: 1.05, normFactor: 1, normUnitPrice: 21.21, resourceType: 'materiaal' }),
    mk('regel', post.id, { quantity: q, normQuantity: 1.5, normFactor: 1, normUnitPrice: 0.13, resourceType: 'materiaal' }),
  ];
  return { ch, post, regels, items: [ch, post, ...regels] as CostItem[] };
}

describe('zonder afrondingsregel rekent de calculator precies als voorheen', () => {
  // Gouden waarde berekend met calculator.ts van HEAD (b897e93, vóór #83) over
  // 150 willekeurige begrotingen × met/zonder tarieven. Dezelfde 400 seeds zijn
  // bij de review ook veld voor veld met de HEAD-versie vergeleken (toEqual).
  const GOLDEN = 'cdea0bb7';

  it('geeft voor undefined en null dezelfde bedragen als de calculator van vóór #83', () => {
    expect(fingerprint(150, (i, t) => recalculateItems(i, t))).toBe(GOLDEN);
    expect(fingerprint(150, (i, t) => recalculateItems(i, t, null))).toBe(GOLDEN);
    expect(fingerprint(150, (i, t) => recalculateItems(i, t, undefined))).toBe(GOLDEN);
  });

  it('ziet alleen een echt object als regel; een leeg object zet centafronding áán', () => {
    for (const geen of [undefined, null, false, 0, ''] as never[]) expect(normalizePriceRounding(geen)).toBeNull();
    // Let op: `{}` (bv. uit een beschadigd bestand of een MCP-aanroep) is wél een regel.
    expect(normalizePriceRounding({})).toEqual(R2);
  });
});

describe('roundHalfUp', () => {
  it('rondt exact half-up af voor decimale invoer, 0 t/m 6 decimalen, positief en negatief', () => {
    const r = rng(7);
    for (let i = 0; i < 20000; i++) {
      const d = Math.floor(r() * 7);
      const extra = 1 + Math.floor(r() * 3);
      const m = Math.floor(r() * 1e9);
      const sign = r() < 0.5 ? -1 : 1;
      // Dwing regelmatig een exacte ….5-grens af.
      const mm = r() < 0.3 ? Math.floor(m / 10 ** extra) * 10 ** extra + 5 * 10 ** (extra - 1) : m;
      const value = sign * mm / 10 ** (d + extra);
      const want = sign * Math.floor((mm + 5 * 10 ** (extra - 1)) / 10 ** extra) / 10 ** d;
      expect(roundHalfUp(value, d) + 0, `${value} op ${d}`).toBe(want + 0);
    }
  });

  it('rondt een product norm × prijs af zoals met de hand (exacte rekensom in BigInt)', () => {
    const r = rng(11);
    for (let i = 0; i < 20000; i++) {
      const a = Math.floor(r() * 5000);    // norm, 3 decimalen
      const b = Math.floor(r() * 500000);  // prijs, 2 decimalen
      const exact = BigInt(a) * BigInt(b); // 5 decimalen
      const want = Number((exact + 500n) / 1000n) / 100;
      expect(roundHalfUp((a / 1000) * (b / 100), 2), `${a / 1000} × ${b / 100}`).toBe(want);
    }
  });

  it('laat 0, NaN en oneindig met rust en rondt kleine waarden naar 0', () => {
    expect(roundHalfUp(0, 2)).toBe(0);
    expect(roundHalfUp(NaN, 2)).toBeNaN();
    expect(roundHalfUp(Infinity, 2)).toBe(Infinity);
    expect(roundHalfUp(4.9999995e-7, 6)).toBe(0);
    expect(roundHalfUp(5e-7, 6)).toBe(0.000001);
    expect(roundHalfUp(-0.5, 0)).toBe(-1);
  });

  // Was gebrek (laag): de marge s × ε × 16 groeide mee met het bedrag en werd
  // bij s ≥ ~1,4e14 groter dan een halve eenheid, zodat 10 miljard op 6
  // decimalen 10.000.000.000,000036 werd. De marge is nu begrensd op 2⁻¹⁰.
  it('laat een al afgerond groot bedrag staan', () => {
    expect(roundHalfUp(1e10, 6)).toBe(1e10);
    expect(roundHalfUp(2e12, 2)).toBe(2e12);
    // Idempotent over het hele bereik, ook ver voorbij realistische bedragen.
    for (let e = 0; e <= 20; e++) {
      for (const d of [0, 2, 6]) {
        const once = roundHalfUp(1.2345678 * 10 ** e, d);
        expect(roundHalfUp(once, d), `1,2345678e${e} op ${d}`).toBe(once);
      }
    }
  });

  it('rondt een groot bedrag met een echte halve cent nog goed af', () => {
    expect(roundHalfUp(123456789.125, 2)).toBe(123456789.13);
    expect(roundHalfUp(123456789.124, 2)).toBe(123456789.12);
    expect(roundHalfUp(0.7 * 18.35, 2)).toBe(12.85);
    expect(roundHalfUp(93.732 * 47.28, 2)).toBe(4431.65);
  });
});

describe('recalculateItems met regel: wat klopt', () => {
  it('rekent het voorbeeld uit #83 uit op 47,28 en 4.431,65', () => {
    const { post, items } = cypePost();
    const out = recalculateItems(items, undefined, R2);
    expect(byId(out, post.id).unitPrice).toBe(47.28);
    expect(byId(out, post.id).total).toBe(4431.65);
  });

  it('is idempotent en houdt regels, post, kolommen en btw-grondslag gelijk (UI-1-regels)', () => {
    for (const rule of [R2, { line: 3, unitPrice: 2, total: 2 }, { line: 2, unitPrice: 4, total: 0 }, { line: 6, unitPrice: 6, total: 6 }, { line: 0, unitPrice: 0, total: 0 }]) {
      const { ch, post, regels, items } = cypePost();
      const staart = [
        mk('staart_abk', null, { staartPercentage: 8 }), mk('staart_winst', null, { staartPercentage: 3 }),
        mk('staart_btw_laag', null, { staartPercentage: 9 }), mk('staart_btw', null, { staartPercentage: 21 }),
      ];
      const once = recalculateItems([...items, ...staart], undefined, rule);
      expect(recalculateItems(once, undefined, rule)).toEqual(once);
      const kp = getKostprijs(once);
      expect(kp).toBe(byId(once, post.id).total);
      expect(byId(once, ch.id).total).toBe(kp);
      expect(sum(regels.map(r => byId(once, r.id).total))).toBeCloseTo(kp, 8);
      expect(kolomSom(once)).toBeCloseTo(kp, 8);
      // Staart: grondslag van de eerste opslag is de afgeronde kostprijs.
      const abk = byId(once, staart[0].id);
      expect(abk.staartItemBreakdown!.bedrag).toBeCloseTo(kp, 8);
      expect(abk.total).toBeCloseTo(kp * 0.08, 8);
      // Btw: alles laag gemarkeerd → de hele kostprijs is lage grondslag.
      const laag = once.map(i => (i.id === ch.id ? { ...i, btwTarief: 'laag' as const } : i));
      expect(computeBtwLaagDirect(laag)).toBeCloseTo(kp, 8);
      const laagBtw = byId(recalculateItems(laag, undefined, rule), staart[2].id);
      expect(laagBtw.staartItemBreakdown!.bedrag).toBeCloseTo(kp * 1.08 * 1.03, 6);
    }
  });

  it('is idempotent op 300 willekeurige begrotingen, en de regels tellen op tot hun afgeronde post', () => {
    const rules: PriceRounding[] = [R2, { line: 5, unitPrice: 2, total: 2 }, { line: 2, unitPrice: 4, total: 0 }];
    for (let seed = 1; seed <= 300; seed++) {
      const rule = rules[seed % rules.length];
      const once = recalculateItems(fuzzBudget(seed), TAR, rule);
      expect(recalculateItems(once, TAR, rule)).toEqual(once);
      const plain = recalculateItems(fuzzBudget(seed), TAR);
      // getKostprijs, de btw-wandeling en de som van de hoofdstukken blijven één bedrag.
      const kp = getKostprijs(once);
      const laag = once.map(i => ({ ...i, btwTarief: i.parentId === null ? 'laag' as const : undefined }));
      expect(computeBtwLaagDirect(laag)).toBeCloseTo(kp, 6);
      for (const p of once.filter(i => i.rowType === 'begrotingspost' && i.quantity)) {
        const kids = once.filter(c => c.parentId === p.id);
        const plainSom = sum(kids.map(c => byId(plain, c.id).total));
        if (!kids.length || kids.some(c => c.rowType !== 'regel') || plainSom === 0) continue;
        expect(sum(kids.map(c => c.total))).toBeCloseTo(p.total, 6);
        expect(roundHalfUp(p.total, rule.total)).toBe(p.total);
        expect(roundHalfUp(p.unitPrice, rule.unitPrice)).toBe(p.unitPrice);
      }
    }
  });

  it('is symmetrisch voor negatieve aantallen (minderwerk)', () => {
    const plus = recalculateItems(cypePost().items, undefined, R2);
    const { items } = cypePost();
    const min = recalculateItems(items.map(i => ({ ...i, quantity: i.quantity == null ? null : -i.quantity })), undefined, R2);
    expect(min.map(i => i.total + 0)).toEqual(plus.map(i => -i.total + 0));
    expect(byId(min, 'i2').unitPrice).toBe(47.28);
  });

  it('rondt per eenheid van de post, ook als een regel een eigen aantal heeft (vast bedrag wordt 3 × 33,33)', () => {
    // Vastgelegd gedrag, geen gebrek volgens FIEBDC — maar de gebruiker ziet
    // een regel "1 × 100,00" met bedrag 99,99. Zie het reviewverslag.
    n = 0;
    const ch = mk('chapter', null);
    const post = mk('begrotingspost', ch.id, { quantity: 3 });
    const vast = mk('regel', post.id, { quantity: 1, normUnitPrice: 100 });
    const out = recalculateItems([ch, post, vast], undefined, R2);
    expect(byId(out, post.id).unitPrice).toBe(33.33);
    expect(byId(out, post.id).total).toBe(99.99);
    expect(byId(out, vast.id).total).toBeCloseTo(99.99, 9);
  });

  it('verdeelt bij 5/2/2 en een groot aantal het restje naar rato over de regels', () => {
    // 2 regels van 5,00249 per eenheid → eenheidsprijs 10,00 (i.p.v.
    // 10,00498), × 100.000 = 1.000.000,00. Het verschil van −498 kwam eerst
    // in zijn geheel op één regel; nu krijgt elke regel de helft.
    n = 0;
    const ch = mk('chapter', null);
    const post = mk('begrotingspost', ch.id, { quantity: 100000 });
    const a = mk('regel', post.id, { quantity: 100000, normUnitPrice: 5.00249 });
    const b = mk('regel', post.id, { quantity: 100000, normUnitPrice: 5.00249 });
    const out = recalculateItems([ch, post, a, b], undefined, { line: 5, unitPrice: 2, total: 2 });
    expect(byId(out, post.id).total).toBe(1000000);
    expect(byId(out, a.id).total + byId(out, b.id).total).toBe(1000000);
    expect(byId(out, a.id).total).toBeCloseTo(500000, 6);
    expect(byId(out, b.id).total).toBeCloseTo(500000, 6);
  });

  it('verdeelt naar rato van de bedragen: een grote regel krijgt meer van het restje dan een kleine', () => {
    n = 0;
    const ch = mk('chapter', null);
    const post = mk('begrotingspost', ch.id, { quantity: 1000 });
    const groot = mk('regel', post.id, { quantity: 1000, normUnitPrice: 0.009 });
    const klein = mk('regel', post.id, { quantity: 1000, normUnitPrice: 0.003 });
    // 3/2/2: 0,009 + 0,003 = 0,012 → 0,01 per eenheid → 10,00; restje −2 (3 : 1).
    const out = recalculateItems([ch, post, groot, klein], undefined, { line: 3, unitPrice: 2, total: 2 });
    expect(byId(out, post.id).total).toBe(10);
    expect(byId(out, groot.id).total).toBeCloseTo(7.5, 9);
    expect(byId(out, klein.id).total).toBeCloseTo(2.5, 9);
    expect(byId(out, groot.id).total + byId(out, klein.id).total).toBe(10);
  });
});

describe('recalculateItems met regel: gevonden gebreken', () => {
  // Was gebrek 1 (hoog): een post zonder regels (kale post met eigen prijs —
  // in BC3 elke partida zonder descompuesto) werd niet afgerond: 93,732 ×
  // 47,28 = 4.431,64896 i.p.v. 4.431,65, en dat telde onafgerond door.
  it('rondt aantal × eenheidsprijs ook af op een post zonder regels', () => {
    n = 0;
    const ch = mk('chapter', null);
    const kaal = mk('begrotingspost', ch.id, { quantity: 93.732, normUnitPrice: 47.28 });
    const out = recalculateItems([ch, kaal], undefined, R2);
    expect(byId(out, kaal.id).total).toBe(4431.65);
    expect(getKostprijs(out)).toBe(4431.65);
  });

  it('rondt ook de eenheidsprijs van een kale post af', () => {
    n = 0;
    const ch = mk('chapter', null);
    const kaal = mk('begrotingspost', ch.id, { quantity: 3, normUnitPrice: 10.004, materialPrice: 0.002 });
    const out = recalculateItems([ch, kaal], undefined, R2);
    expect(byId(out, kaal.id).unitPrice).toBe(10.01);
    expect(byId(out, kaal.id).total).toBe(30.03);
    // Zonder regel onveranderd.
    expect(byId(recalculateItems([ch, kaal]), kaal.id).total).toBeCloseTo(30.018, 9);
  });

  it('rondt ook af als de eigen prijs van de post telt omdat de regels niets opleveren', () => {
    n = 0;
    const ch = mk('chapter', null);
    const post = mk('begrotingspost', ch.id, { quantity: 93.732, normUnitPrice: 47.28 });
    const leeg = mk('regel', post.id, { quantity: 93.732 });
    expect(byId(recalculateItems([ch, post, leeg], undefined, R2), post.id).total).toBe(4431.65);
  });

  // Was gebrek 2 (hoog): één tekstregel of witregel onder de post zette de
  // afronding van die post uit; een toelichting toevoegen veranderde het
  // bedrag van 1.204,46 naar 1.203,98754.
  it('laat een tekstregel onder de post de afronding niet uitzetten', () => {
    n = 0;
    const ch = mk('chapter', null);
    const post = mk('begrotingspost', ch.id, { quantity: 93.732 });
    const regel = mk('regel', post.id, { quantity: 93.732, normQuantity: 0.7, normFactor: 1, normUnitPrice: 18.35 });
    const tekst = mk('tekstregel', post.id, { description: 'toelichting' });
    const zonder = byId(recalculateItems([ch, post, regel], undefined, R2), post.id).total;
    expect(zonder).toBe(1204.46);
    expect(byId(recalculateItems([ch, post, regel, tekst], undefined, R2), post.id).total).toBe(zonder);
    const wit = mk('witregel', post.id, { description: 'nog een' });
    expect(byId(recalculateItems([ch, post, tekst, regel, wit], undefined, R2), post.id).total).toBe(zonder);
  });

  // Was gebrek 3 (middel): een post met een regel én een subpost rekende
  // onafgerond, maar FIEBDC rondt ook daar: een samengestelde prijs
  // (auxiliar) is gewoon een regel van de bovenliggende partida.
  it('rondt een post met een regel en een subpost ook af', () => {
    n = 0;
    const ch = mk('chapter', null);
    const post = mk('begrotingspost', ch.id, { quantity: 3 });
    const regel = mk('regel', post.id, { quantity: 3, normQuantity: 0.7, normFactor: 1, normUnitPrice: 18.35 });
    const sub = mk('begrotingspost', post.id, { quantity: 3 });
    const subRegel = mk('regel', sub.id, { quantity: 3, normQuantity: 1.05, normFactor: 1, normUnitPrice: 21.21 });
    const out = recalculateItems([ch, post, regel, sub, subRegel], undefined, R2);
    expect(byId(out, sub.id).total).toBe(66.81); // de subpost zelf rondt wel af
    const total = byId(out, post.id).total;       // 38,535 + 66,81 = 105,345
    expect(roundHalfUp(total, 2)).toBe(total);
    // 12,845 → 12,85 en 66,81 / 3 = 22,27 → 35,12 per eenheid → 105,36.
    expect(byId(out, post.id).unitPrice).toBe(35.12);
    expect(total).toBe(105.36);
    // De subpost houdt zijn eigen (afgeronde) totaal; het restje gaat naar de regel.
    expect(byId(out, subRegel.id).total).toBeCloseTo(66.81, 9);
    expect(byId(out, regel.id).total + byId(out, sub.id).total).toBeCloseTo(total, 9);
    expect(recalculateItems(out, undefined, R2)).toEqual(out);
  });

  it('rondt een subpost per eenheid van de bovenliggende post, met het restje op de regels', () => {
    n = 0;
    const ch = mk('chapter', null);
    const post = mk('begrotingspost', ch.id, { quantity: 7 });
    const regel = mk('regel', post.id, { quantity: 7, normUnitPrice: 1 });
    // Subpost met een vast totaal van 10,00 → per eenheid van de post 1,428571… → 1,43.
    const sub = mk('begrotingspost', post.id, { quantity: 1, normUnitPrice: 10 });
    const out = recalculateItems([ch, post, regel, sub], undefined, R2);
    expect(byId(out, sub.id).total).toBe(10);
    expect(byId(out, post.id).unitPrice).toBe(2.43);
    expect(byId(out, post.id).total).toBe(17.01);
    expect(byId(out, regel.id).total).toBeCloseTo(7.01, 9);
  });

  it('laat een post met alleen subposten de som van die subposten houden', () => {
    // Zonder regels is er niets om het restje op te vangen; de subposten zijn
    // zelf al afgerond, dus hun som blijft staan (met de afgeleide eenheidsprijs).
    n = 0;
    const ch = mk('chapter', null);
    const post = mk('begrotingspost', ch.id, { quantity: 3 });
    const a = mk('begrotingspost', post.id, { quantity: 1, normUnitPrice: 10 });
    const b = mk('begrotingspost', post.id, { quantity: 1, normUnitPrice: 0.005 });
    const out = recalculateItems([ch, post, a, b], undefined, R2);
    expect(byId(out, b.id).total).toBe(0.01);
    expect(byId(out, post.id).total).toBeCloseTo(10.01, 9);
    expect(byId(out, post.id).unitPrice).toBeCloseTo(10.01 / 3, 9);
  });

  // Was gebrek 4 (middel): als de regels fijner afronden dan de eenheidsprijs
  // (line > unitPrice) kon het restje groter zijn dan de grootste regel, die
  // dan van teken omsloeg: 2 regels van 0,002 per eenheid × 1000 → post
  // 0,00, regels −2,00 en +2,00. Het restje gaat nu naar rato.
  it('laat geen regel van teken omslaan door het restje', () => {
    n = 0;
    const ch = mk('chapter', null);
    const post = mk('begrotingspost', ch.id, { quantity: 1000 });
    const a = mk('regel', post.id, { quantity: 1000, normUnitPrice: 0.002, resourceType: 'arbeid' });
    const b = mk('regel', post.id, { quantity: 1000, normUnitPrice: 0.002, resourceType: 'materiaal' });
    const out = recalculateItems([ch, post, a, b], undefined, { line: 3, unitPrice: 2, total: 2 });
    expect(byId(out, a.id).total).toBeGreaterThanOrEqual(0);
    expect(byId(out, b.id).total).toBeGreaterThanOrEqual(0);
    expect(byId(out, post.id).total).toBe(0);
    const k = computeKostprijsBreakdown(out);
    expect(k.loon).toBeCloseTo(0, 9);
    expect(k.materiaal).toBeCloseTo(0, 9);
  });

  it('laat op 300 willekeurige begrotingen geen regel omslaan en de kinderen optellen tot hun post', () => {
    const rules: PriceRounding[] = [R2, { line: 3, unitPrice: 2, total: 2 }, { line: 5, unitPrice: 2, total: 2 }, { line: 6, unitPrice: 0, total: 0 }];
    for (let seed = 1; seed <= 300; seed++) {
      const rule = rules[seed % rules.length];
      const once = recalculateItems(fuzzBudget(seed), TAR, rule);
      const plain = recalculateItems(fuzzBudget(seed), TAR);
      for (const r of once.filter(i => i.rowType === 'regel')) {
        const p = byId(plain, r.id).total;
        // Afronden mag een regel naar 0 brengen, maar niet van teken laten wisselen.
        if (Math.abs(p) > 1e-9 && Math.abs(r.total) > 1e-9) expect(Math.sign(r.total), `seed ${seed} regel ${r.id}`).toBe(Math.sign(p));
      }
      for (const p of once.filter(i => i.rowType === 'begrotingspost')) {
        const kids = once.filter(c => c.parentId === p.id && !c.rowType.startsWith('staart_'));
        const kidSum = sum(kids.map(c => c.total));
        if (!kids.length) {
          // Kale post: afgerond.
          expect(roundHalfUp(p.total, rule.total), `seed ${seed} kale post ${p.id}`).toBe(p.total);
        } else if (kidSum !== 0 || p.total === 0) {
          // Geen eigen-prijs-pad: de kinderen tellen op tot de post.
          expect(kidSum, `seed ${seed} post ${p.id}`).toBeCloseTo(p.total, 6);
        }
      }
    }
  });

  // GEBREK 5 (middel): computeKostprijsBreakdown (en de Rust-spiegel
  // reports/staart.rs kostprijs_kolommen) splitst een regel met uurloon in
  // loon + materiaal als aantal × (loon + prijs) binnen een cent van het
  // totaal ligt. Door de afronding wijkt het totaal daar nu van af:
  //  a) verschil ≥ 0,01 → geen splitsing: het hele bedrag gaat naar de
  //     materiaalkolom en het loon verdwijnt uit de loonkolom;
  //  b) verschil < 0,01 → wel splitsing, met de onafgeronde bedragen: de
  //     kolommen tellen niet meer op tot de kostprijs, en de staart
  //     (computeStaartItemBreakdowns, Bouw 1 in Rust) start op een ander
  //     bedrag dan getKostprijs / de hoofdstuktotalen.
  // Oplossing: de splitsing naar rato op het afgeronde totaal toepassen
  // (loon = total × splitLoon / (splitLoon + splitMat)), in TS én Rust.
  it.fails('houdt het loon in de loonkolom bij een regel met uurloon (WpCalc-model)', () => {
    n = 0;
    const ch = mk('chapter', null);
    const post = mk('begrotingspost', ch.id, { quantity: 10 });
    const regel = mk('regel', post.id, { quantity: 10, normUnitPrice: 1.004, laborPrice: 2.003 });
    const zonder = computeKostprijsBreakdown(recalculateItems([ch, post, regel]));
    expect(zonder.loon).toBeCloseTo(20.03, 9);
    const met = computeKostprijsBreakdown(recalculateItems([ch, post, regel], undefined, R2));
    expect(met.loon).toBeGreaterThan(20); // is 0: alles (30,10) staat onder materiaal
  });

  it.fails('laat de kostprijskolommen optellen tot de kostprijs bij een regel met uurloon', () => {
    n = 0;
    const ch = mk('chapter', null);
    const post = mk('begrotingspost', ch.id, { quantity: 2 });
    const regel = mk('regel', post.id, { quantity: 2, normUnitPrice: 1.004, laborPrice: 2.003 });
    const abk = mk('staart_abk', null, { staartPercentage: 10 });
    const out = recalculateItems([ch, post, regel, abk], undefined, R2);
    expect(getKostprijs(out)).toBe(6.02);
    expect(kolomSom(out)).toBeCloseTo(6.02, 9);                                  // is 6,014
    expect(byId(out, abk.id).staartItemBreakdown!.bedrag).toBeCloseTo(6.02, 9);  // is 6,014
  });
});

describe('de regel blijft behouden in de store', () => {
  const laad = (priceRounding: PriceRounding | null | undefined) => {
    const { items, post, regels } = cypePost();
    const s = useAppStore.getState();
    for (const d of [...s.documents]) s.removeDocument(d.id);
    s.addDocument({ items, schedule: { ...createDefaultSchedule(), ...(priceRounding ? { priceRounding } : {}) } });
    return { post, regels };
  };
  const totaal = (id: string) => byId(useAppStore.getState().items, id).total;

  beforeEach(() => { n = 0; });

  it('openen, cel bewerken, setItems, recalculate en ongedaan maken ronden allemaal af', () => {
    const { post, regels } = laad(R2);
    expect(totaal(post.id)).toBe(4431.65);
    const s = useAppStore.getState();
    s.pushHistory(useAppStore.getState().items, 'aantal');
    s.updateItem(regels[3].id, 'normUnitPrice', 0.14); // 1,5 × 0,14 = 0,21 → 47,29
    expect(byId(useAppStore.getState().items, post.id).unitPrice).toBe(47.29);
    expect(totaal(post.id)).toBe(4432.59);
    s.recalculate();
    expect(totaal(post.id)).toBe(4432.59);
    const terug = useAppStore.getState().undo();
    useAppStore.getState().setItems(terug!);
    expect(totaal(post.id)).toBe(4431.65);
    useAppStore.getState().setItems(useAppStore.getState().redo()!);
    expect(totaal(post.id)).toBe(4432.59);
  });

  it('een begroting zonder regel blijft onafgerond na dezelfde bewerkingen', () => {
    const { post, regels } = laad(undefined);
    expect(totaal(post.id)).toBeCloseTo(4430.383578, 6);
    useAppStore.getState().updateItem(regels[3].id, 'normUnitPrice', 0.14);
    expect(totaal(post.id)).toBeCloseTo(93.732 * (0.7 * 18.35 + 0.7 * 17.08 + 1.05 * 21.21 + 1.5 * 0.14), 6);
  });

  it('bewaart de regel in het .ifcCalc-bestand en leest hem terug', () => {
    const { items } = cypePost();
    const rule = { line: 3, unitPrice: 2, total: 2 };
    const json = serializeProject({ ...createDefaultSchedule(), priceRounding: rule }, recalculateItems(items, undefined, rule));
    const terug = deserializeProject(json);
    expect(terug.schedule.priceRounding).toEqual(rule);
    expect(deserializeProject(serializeProject(createDefaultSchedule(), items)).schedule.priceRounding).toBeUndefined();
  });

  it('rekent varianttotalen met de regel, en zonder regel in de scope onafgerond', () => {
    const { items, post } = cypePost();
    const anders = mk('begrotingspost', 'i1', { quantity: 1, normUnitPrice: 5, branchId: 'v2' } as never);
    const alle = recalculateItems([...items, anders], undefined, R2);
    const scope = { branchesEnabled: true, activeBranchId: 'main', branches: [{ id: 'main', name: 'main', parentId: null }, { id: 'v2', name: 'v2', parentId: 'main' }] };
    const met = variantCalculatedItems(alle, { ...scope, priceRounding: R2 });
    expect(met).not.toBe(alle); // de variant filtert echt
    expect(byId(met, post.id).total).toBe(4431.65);
    // Een zelf samengestelde scope moet priceRounding expliciet noemen
    // (verplicht in VariantScope); zonder regel rekent hij onafgerond.
    const zonder = variantCalculatedItems([...alle], { ...scope, priceRounding: undefined });
    expect(byId(zonder, post.id).total).toBeCloseTo(4430.383578, 6);
  });

  // Was gebrek 6 (middel): setSchedule herberekende niet. Een regel zetten,
  // wijzigen of weghalen (MCP `update_schedule` via mcpBridge, extensie-API
  // setSchedule) liet alle bedragen staan tot de eerstvolgende bewerking.
  it('herberekent zodra de regel via setSchedule verandert', () => {
    const { post } = laad(undefined);
    useAppStore.getState().setSchedule({ priceRounding: R2 });
    expect(totaal(post.id)).toBe(4431.65);
    useAppStore.getState().setSchedule({ priceRounding: undefined });
    expect(totaal(post.id)).toBeCloseTo(4430.383578, 6);
    // Hele schedule (zoals mcpBridge update_schedule doet), eenheidsprijs op hele euro's.
    useAppStore.getState().setSchedule({ ...useAppStore.getState().schedule, priceRounding: { line: 2, unitPrice: 0, total: 2 } });
    expect(totaal(post.id)).toBe(roundHalfUp(93.732 * 47, 2));
    useAppStore.getState().setSchedule({ priceRounding: null });
    expect(totaal(post.id)).toBeCloseTo(4430.383578, 6);
  });

  it('herberekent niet bij setSchedule zonder (andere) regel', () => {
    const { post } = laad(R2);
    const items = useAppStore.getState().items;
    useAppStore.getState().setSchedule({ projectName: 'x' });
    expect(useAppStore.getState().items).toBe(items);
    useAppStore.getState().setSchedule({ priceRounding: { ...R2 } }); // zelfde werkende regel
    expect(useAppStore.getState().items).toBe(items);
    expect(totaal(post.id)).toBe(4431.65);
    expect(useAppStore.getState().schedule.projectName).toBe('x');
  });
});

describe('bewaking van de aanroepers', () => {
  // Was gebrek 7 (middel): `pdfVariantScope()` in mcp-server bouwde de
  // variant-scope zonder priceRounding, zodat `export_pdf` met een actieve
  // variant onafgeronde bedragen gaf. priceRounding is nu verplicht in een
  // zelf samengestelde VariantScope, en recalculateCallers.test.ts scant ook
  // mcp-server/src.
  it('geeft de regel mee aan de variant-scope van MCP export_pdf', () => {
    const text = readFileSync(path.resolve(process.cwd(), 'mcp-server/src/index.ts'), 'utf-8');
    const start = text.indexOf('function pdfVariantScope()');
    expect(start).toBeGreaterThan(0);
    expect(text.slice(start, text.indexOf('\n}', start))).toContain('priceRounding');
  });
});
