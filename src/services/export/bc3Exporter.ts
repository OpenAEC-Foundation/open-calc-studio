/**
 * FIEBDC-3 (.bc3) exporter — schrijft de begroting als Spaans
 * uitwisselbestand (fiebdc.es): ~V-kop, ~C-concepten, ~D-decomposities,
 * ~M-metingen en ~T-teksten, gecodeerd als Windows-1252 ("ANSI") of — als
 * de tekst daar niet in past — als UTF-8 met die tekenset in de kop.
 *
 * Mapping vanuit OCS: hoofdstukken → concepten met `#`-suffix, posten →
 * partida's (hoeveelheid via ~M, met positiepad), rekenregels →
 * basisconcepten met rendement = hoeveelheid middel per posteenheid en
 * prijs = prijs/middel (+ loon). Staartregels worden niet geëxporteerd — BC3
 * kent geen opslagen-cascade; de ontvanger rekent met zijn eigen indirecte
 * kosten.
 *
 * Een concept is in BC3 één ~C-record dat vanuit meerdere decomposities
 * wordt aangehaald. Rekenregels, kale posten en samengestelde posten die
 * inhoudelijk identiek zijn (zelfde code, omschrijving, eenheid, prijs,
 * tekst en — voor samengestelde posten — dezelfde samenstelling) delen
 * daarom één concept; alleen als dezelfde code voor iets anders wordt
 * gebruikt krijgt de tweede een `_n`-suffix. Hoofdstukken blijven altijd
 * uniek.
 */
import type { CostItem, CostSchedule } from '@/types/costModel';
import { encodeWindows1252, fitsWindows1252 } from '@/services/importers/windows1252';

/**
 * Getal als BC3-tekst: punt als decimaalteken, geen exponentnotatie, geen
 * overbodige nullen en geen drijvende-kommaruis. Ten hoogste 6 decimalen
 * zodra die het getal reproduceren (relatief binnen 1e-9): een opgetelde
 * kostprijs `434687.42649000004` wordt `434687.42649`. Een getal dat echt
 * meer decimalen heeft (TCQ-rendement `0.119760479041916`, ppl-prijs
 * `282.6300019752`) houdt ze — afronden op 6 decimalen verschuift bij
 * pesetabedragen in de miljoenen de rijtotalen met meer dan 0,01 — maar op
 * 15 significante cijfers, zodat de ruis van de 16e/17e digit wegvalt.
 */
const num = (n: number | null | undefined): string => {
  const v = n ?? 0;
  if (!Number.isFinite(v) || v === 0) return '0';
  const six = Math.round(v * 1e6) / 1e6;
  const clean = Math.abs(six - v) <= 1e-9 * Math.abs(v) ? six : Number(v.toPrecision(15));
  const s = String(clean);
  if (!/e/i.test(s)) return s === '-0' ? '0' : s;
  const fixed = clean.toFixed(20).replace(/\.?0+$/, '');
  return fixed === '' || fixed === '-0' ? '0' : fixed;
};

/** Veldtekst veiligmaken: |, ~ en \ zijn structuurtekens in BC3. */
const esc = (s: string | null | undefined): string =>
  (s ?? '').replace(/[|~\\]/g, ' ').replace(/\r?\n/g, ' ').trim();

/**
 * Tekst voor een ~T-record: regeleinden mogen (en horen) blijven — het
 * record loopt gewoon door tot de volgende `~`. Genormaliseerd naar CRLF.
 */
const escText = (s: string | null | undefined): string =>
  (s ?? '').replace(/[|~\\]/g, ' ').replace(/\r?\n/g, '\r\n').trim();

const TYPE_BY_RESOURCE: Record<string, string> = {
  arbeid: '1',
  materieel: '2',
  materiaal: '3',
};

/** Afgeronde prijs zoals hij in het bestand komt — de basis voor gelijkheid. */
const money = (n: number): number => Math.round(n * 1e6) / 1e6;

/** Scheidingsteken in handtekeningen van concepten (komt in geen veld voor). */
const SEP = String.fromCharCode(1);

export type Bc3Charset = 'ANSI' | 'UTF-8';

export function buildBc3(schedule: CostSchedule, items: CostItem[], charset: Bc3Charset = 'ANSI'): string {
  const cLines: string[] = [];
  const dRecords: string[] = [];
  const mRecords: string[] = [];
  const tRecords: string[] = [];

  const byParent = new Map<string | null, CostItem[]>();
  for (const it of items) {
    if (it.rowType.startsWith('staart_') || it.rowType === 'witregel') continue;
    const list = byParent.get(it.parentId) ?? [];
    list.push(it);
    byParent.set(it.parentId, list);
  }
  const isContainer = (it: CostItem): boolean =>
    it.rowType === 'chapter' || it.rowType === 'begrotingspost' || it.rowType === 'bewakingspost';

  // ── Codes en gedeelde concepten ──────────────────────────────────────────
  // `used` bewaakt uniciteit (hoofdletterongevoelig, zoals lezers de codes
  // opzoeken); `bySignature` deelt één code uit aan inhoudelijk gelijke
  // concepten zodat een middel dat in 200 posten zit ook één ~C-record is.
  const used = new Set<string>();
  const bySignature = new Map<string, string>();
  const lineOf = new Map<string, number>();   // code → index in cLines
  const typeOf = new Map<string, string>();   // code → TIPO in dat ~C
  let auto = 0;
  const allocate = (rawCode: string): string => {
    // Spaties binnen een code komen in echte bestanden voor en blijven staan;
    // alleen '#' is gereserveerd (hoofdstuk-/wortelmarkering).
    const base = esc(rawCode).replace(/#/g, '').trim() || `C${String(++auto).padStart(4, '0')}`;
    let code = base;
    let n = 1;
    while (used.has(code.toUpperCase())) code = `${base}_${n++}`;
    used.add(code.toUpperCase());
    return code;
  };

  const conceptLine = (code: string, unit: string, summary: string, price: number, type: string): string =>
    `~C|${code}|${esc(unit)}|${esc(summary)}|${num(price)}||${type}|`;
  const textRecord = (code: string, text: string | null | undefined): void => {
    const t = escText(text);
    if (t) tRecords.push(`~T|${code}|${t}|`);
  };

  /**
   * Concept opzoeken of aanmaken. Een kale post en een rekenregel met
   * dezelfde code, omschrijving, eenheid, prijs en tekst zijn hetzelfde
   * concept (een prijzenbank noemt zijn middelen ook als posten). Het type
   * (arbeid/materieel/materiaal) komt van de regel; een kale post heeft er
   * geen ('0') en neemt het over van de regel als die er later bij komt.
   *
   * Een rekenregel kent geen samenstelling. Verwijst hij naar een concept
   * dat elders wél samengesteld is (een hulpprijs uit een prijzenbank), dan
   * deelt hij dat concept — ook als zijn prijs afwijkt van wat de
   * samenstelling oplevert: prijzenbanken (BCCA, Arquímedes) gebruiken de
   * op 2 decimalen afgeronde catalogusprijs als middel terwijl de
   * samenstelling meer decimalen geeft. De ~C-prijs is dan die van het
   * middel (zoals in het origineel), de ~D levert de post-prijs; bij
   * herimport komen beide bedragen ongewijzigd terug. Andersom krijgt een
   * concept dat als middel begon alsnog zijn ~D als dezelfde kop later mét
   * samenstelling langskomt.
   *
   * Een kale post (zonder samenstelling) deelt nooit een concept waarvan de
   * ~C-prijs van zijn eigen prijs afwijkt: bij herimport zou hij anders
   * een ander bedrag krijgen.
   */
  const withParts = new Set<string>();
  const fromRegel = new Set<string>();   // concepten aangemaakt door een rekenregel
  const fromPost = new Set<string>();    // concepten (ook) gebruikt door een kale post
  const catalog = new Map<string, number>(); // ~C-prijs als die van een middel komt
  const byBase = new Map<string, string[]>(); // kop zonder prijs → codes
  const concept = (it: CostItem, unit: string, price: number, type: string, parts: string[]): string => {
    const isRegel = it.rowType === 'regel';
    const base = [it.code, unit, esc(it.description), escText(it.notes)].join(SEP);
    const head = [base, num(price)].join(SEP);
    const sig = parts.length > 0 ? [head, ...parts].join(SEP) : head;
    let known = bySignature.get(sig);
    if (known && parts.length === 0 && !isRegel && catalog.has(known) && catalog.get(known) !== price) {
      known = undefined; // kale post: eigen prijs moet de ~C-prijs blijven
    }
    if (!known) {
      const byHead = bySignature.get(head);
      if (byHead && parts.length === 0) {
        known = byHead;
      } else if (parts.length > 0) {
        // Samengestelde post: een concept met dezelfde kop dat nog geen ~D
        // heeft (zelfde prijs, of als middel met catalogusprijs).
        const candidate = byHead && !withParts.has(byHead) ? byHead
          : (byBase.get(base) ?? []).find((c) => !withParts.has(c) && fromRegel.has(c) && !fromPost.has(c));
        if (candidate) {
          dRecords.push(`~D|${candidate}|${parts.join('\\')}\\|`);
          withParts.add(candidate);
          if (candidate !== byHead) catalog.set(candidate, Number(cLines[lineOf.get(candidate)!].split('|')[4]));
          bySignature.set(sig, candidate);
          known = candidate;
        }
      } else if (isRegel) {
        // Rekenregel: een samengesteld concept met dezelfde kop dat nog
        // geen middelprijs heeft, krijgt die van deze regel in zijn ~C.
        const candidate = (byBase.get(base) ?? []).find((c) => withParts.has(c) && !catalog.has(c) && !fromPost.has(c));
        if (candidate) {
          cLines[lineOf.get(candidate)!] = conceptLine(candidate, unit, it.description, price, type !== '0' ? type : typeOf.get(candidate) ?? '0');
          catalog.set(candidate, price);
          bySignature.set(head, candidate);
          known = candidate;
        }
      }
    }
    if (known) {
      if (isRegel) fromRegel.add(known); else if (parts.length === 0) fromPost.add(known);
      if (type !== '0' && typeOf.get(known) === '0') {
        cLines[lineOf.get(known)!] = conceptLine(known, unit, it.description, catalog.get(known) ?? price, type);
        typeOf.set(known, type);
      }
      return known;
    }
    const code = allocate(it.code);
    bySignature.set(sig, code);
    bySignature.set(head, code);
    byBase.set(base, [...(byBase.get(base) ?? []), code]);
    if (isRegel) fromRegel.add(code); else if (parts.length === 0) fromPost.add(code);
    lineOf.set(code, cLines.length);
    typeOf.set(code, type);
    cLines.push(conceptLine(code, unit, it.description, price, type));
    textRecord(code, it.notes);
    if (parts.length > 0) {
      dRecords.push(`~D|${code}|${parts.join('\\')}\\|`);
      withParts.add(code);
    }
    return code;
  };

  // ── Rekenregels ──────────────────────────────────────────────────────────

  /**
   * Prijs per eenheid van het middel, zoals de calculator hem rekent:
   * norm-model → prijs/middel; direct-model (loon of geen norm) → prijs + loon.
   */
  const regelPrice = (k: CostItem): number => {
    const nup = k.normUnitPrice ?? 0;
    const lab = k.laborPrice ?? 0;
    const norm = k.normQuantity ?? 0;
    return money(lab > 0 || norm === 0 ? nup + lab : nup);
  };

  /**
   * Rendement (hoeveelheid middel per eenheid van de post). De norm zelf
   * als die het berekende bedrag reproduceert (verreweg het meest, en
   * zonder afrondingsruis); anders afgeleid van het bedrag, zodat het
   * direct-model van de calculator en een afwijkend aantal op de regel ook
   * goed in het bestand komen.
   */
  const regelYield = (k: CostItem, postQty: number, price: number): number => {
    const norm = k.normQuantity ?? 0;
    const lab = k.laborPrice ?? 0;
    const own = lab > 0 || norm === 0 ? 1 : norm / (k.normFactor || 1);
    if (postQty === 0) return own;
    const expected = own * price * postQty;
    if (Math.abs(expected - k.total) <= 1e-9 * Math.max(1, Math.abs(k.total))) return own;
    return price !== 0 ? (k.total / postQty) / price : 0;
  };

  /**
   * Opslagregel zoals de BC3-importer hem aanmaakt: eenheid '%', norm = het
   * percentage als fractie en prijs/middel = de grondslag (de som van de
   * voorgaande regels, of — TCQ-conventie — alleen de arbeid daarin). Die
   * laatste eigenschap is de toets — een gewone regel die toevallig '%' als
   * eenheid heeft rekent norm × prijs en blijft een gewone regel. Geeft de
   * grondslag terug, of null.
   */
  const percentageBase = (k: CostItem, running: number, labour: number): number | null => {
    if (k.unit !== '%' || (k.laborPrice ?? 0) !== 0) return null;
    const nup = k.normUnitPrice ?? 0;
    const near = (b: number): boolean => Math.abs(nup - b) <= 0.005 * Math.max(1, Math.abs(b));
    if (near(running)) return running;
    if (near(labour)) return labour;
    return null;
  };

  // ── Samengestelde concepten (posten, geneste bewakingsposten) ────────────

  interface Composition { parts: string[]; unitCost: number; }

  /**
   * Decompositie van een post: rekenregels en geneste bewakingsposten, elk
   * met rendement per eenheid van de post. Een geneste bewakingspost wordt
   * een hulpconcept (prijs per eenheid van de ouder, rendement 1).
   */
  const compose = (post: CostItem, postQty: number): Composition => {
    const parts: string[] = [];
    let unitCost = 0;
    let labour = 0;
    for (const k of byParent.get(post.id) ?? []) {
      if (k.rowType === 'regel') {
        const base = percentageBase(k, unitCost, labour);
        if (base != null) {
          // Percentage-concept: prijs 0 in ~C (de grondslag is per partida
          // anders en hoort niet bij het concept), de fractie in ~D.
          const pct = k.normQuantity ?? 0;
          parts.push(`${concept(k, '%', 0, '0', [])}\\1\\${num(pct)}`);
          unitCost += base * pct;
          continue;
        }
        const price = regelPrice(k);
        const rend = regelYield(k, postQty, price);
        parts.push(`${concept(k, k.unit, price, TYPE_BY_RESOURCE[k.resourceType ?? ''] ?? '0', [])}\\1\\${num(rend)}`);
        unitCost += rend * price;
        if (k.resourceType === 'arbeid') labour += rend * price;
      } else if (k.rowType === 'bewakingspost' || k.rowType === 'begrotingspost') {
        const perUnit = postQty !== 0 ? k.total / postQty : k.total;
        const { parts: sub } = compose(k, postQty !== 0 ? postQty : 1);
        parts.push(`${concept(k, k.unit, money(perUnit), '0', sub)}\\1\\1`);
        unitCost += perUnit;
      }
    }
    return { parts, unitCost: money(unitCost) };
  };

  /** Partida: concept (gedeeld bij gelijke inhoud) plus een eigen ~M per voorkomen. */
  const writePost = (it: CostItem, parentCode: string, path: number[]): string => {
    const qty = it.quantity ?? 0;
    const { parts, unitCost } = compose(it, qty);
    const price = parts.length > 0 ? unitCost : money(it.unitPrice);
    const code = concept(it, it.unit, price, '0', parts);
    mRecords.push(`~M|${parentCode}\\${code}|${path.join('\\')}\\|${num(qty)}||`);
    return code;
  };

  // ── Hoofdstukken ─────────────────────────────────────────────────────────

  const chapterCode = new Map<string, string>();
  const codeOfChapter = (it: CostItem): string => {
    let code = chapterCode.get(it.id);
    if (!code) {
      code = `${allocate(it.code)}#`;
      chapterCode.set(it.id, code);
    }
    return code;
  };

  /** Kinderen die in de decompositie van een hoofdstuk (of de wortel) komen. */
  const structural = (parentId: string | null): CostItem[] =>
    (byParent.get(parentId) ?? []).filter(isContainer);

  const writeChapter = (it: CostItem, path: number[]): void => {
    const code = codeOfChapter(it);
    cLines.push(conceptLine(code, '', it.description, it.total, '0'));
    textRecord(code, it.notes);
    writeBranch(code, structural(it.id), path);
  };

  /** Decompositie + kinderen van een hoofdstuk of de wortel. */
  const writeBranch = (parentCode: string, kids: CostItem[], path: number[]): void => {
    // Codes van posten zijn pas bekend na hun samenstelling; daarom eerst
    // de kinderen schrijven en de ~D daarna invoegen.
    const parts: string[] = [];
    const dIndex = dRecords.length;
    kids.forEach((k, i) => {
      const childPath = [...path, i + 1];
      if (k.rowType === 'chapter') {
        parts.push(`${codeOfChapter(k)}\\1\\1`);
        writeChapter(k, childPath);
      } else {
        parts.push(`${writePost(k, parentCode, childPath)}\\1\\1`);
      }
    });
    if (parts.length > 0) dRecords.splice(dIndex, 0, `~D|${parentCode}|${parts.join('\\')}\\|`);
  };

  // ── Wortel ───────────────────────────────────────────────────────────────

  const projectName = esc(schedule.projectName || schedule.name || 'Begroting');
  const rootCode = 'OCS##';
  used.add('OCS');
  const top = structural(null);
  const rootTotal = top.reduce((s, i) => s + i.total, 0);
  cLines.push(conceptLine(rootCode, '', projectName, rootTotal, '0'));
  textRecord(rootCode, schedule.description);
  writeBranch(rootCode, top, []);

  // ~V: | eigenschap | formaatversie | programma | kop | tekenset |
  const header = `~V||FIEBDC-3/2004|Open Calc Studio||${charset}|||||`;
  return [header, ...cLines, ...dRecords, ...mRecords, ...tRecords].join('\r\n') + '\r\n';
}

/**
 * Bytes van het bestand: Windows-1252 zolang alle tekens daarin passen,
 * anders UTF-8 (FIEBDC-3 kent die tekenset sinds 2012; oudere lezers
 * tonen dan hooguit de accenten verkeerd, maar er gaat niets verloren).
 */
export function buildBc3Bytes(schedule: CostSchedule, items: CostItem[]): { bytes: Uint8Array; charset: Bc3Charset } {
  const ansi = buildBc3(schedule, items, 'ANSI');
  if (fitsWindows1252(ansi)) return { bytes: encodeWindows1252(ansi), charset: 'ANSI' };
  return { bytes: new TextEncoder().encode(buildBc3(schedule, items, 'UTF-8')), charset: 'UTF-8' };
}

export { encodeWindows1252 } from '@/services/importers/windows1252';

export function exportBc3(schedule: CostSchedule, items: CostItem[]): void {
  const { bytes } = buildBc3Bytes(schedule, items);
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${schedule.projectName || schedule.name || 'begroting'}.bc3`;
  a.click();
  URL.revokeObjectURL(url);
}
