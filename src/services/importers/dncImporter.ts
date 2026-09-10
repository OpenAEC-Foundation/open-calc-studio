/**
 * .DNC importer — een extern begrotingsformaat (STABU-directiebegroting).
 *
 * Een .DNC-bestand is een 7z-archief met dBASE-tabellen (.DBF + .DBT-memo's).
 * Per project staan er ~21 tabellen in, geprefixt met twee letters + de
 * (afgekapte) projectnaam, bv. `KKVoorbe.DBF`. De begrotingsdata:
 *
 *   KK — de posten (regel per `*`-post): STABU-code, omschrijving, hoeveelheid,
 *        eenheid, en de bedragen TOT1=loon, TOT2=materiaal, TOT4=onderaanneming,
 *        TOTAAL = TOT1+TOT2+TOT4.
 *   KU — de middelen per post (gekoppeld via CODE2 = de STABU-code van de post):
 *        GETAL1 = uren-norm (arbeid), GETAL2 = materiaal-eenheidsprijs,
 *        GETAL3 = materieel, GETAL4 = onderaanneming-eenheidsprijs.
 *   VU — uurtarief ("0e uurtarief").
 *   VT — staartpercentages (AK, W&R, CAR, BTW).
 *   VD — projectkengetallen (Bruto m², m³, woningen).
 *
 * Deze module bevat een minimale DBF/DBT-lezer plus een pure mapping-functie
 * (buildDncImport) die los te testen is. Het uitpakken van het 7z-archief en
 * het inlezen van de bestanden gebeurt in de importeur-wrapper (dncFile.ts),
 * net als bij de andere zware importeurs.
 */
import type { CostItem, CostSchedule, ResourceType } from '@/types/costModel';
import { makeCostItem, parseNumber, normalizeUnit, genId } from './core';

// ── dBASE (DBF/DBT) parser ────────────────────────────────────────────────

export interface DbfField {
  name: string;
  type: string; // C, N, F, D, L, M, ...
  length: number;
  decimals: number;
}
export type DbfRecord = Record<string, string>;
export interface DbfTable {
  fields: DbfField[];
  records: DbfRecord[];
}

// CP850 (DOS Latin-1) hoge helft (0x80–0xFF) → Unicode. dBASE-tekst uit deze
// begrotingstool is CP850-gecodeerd (Nederlandse accenten, ï/é/ë).
const CP850_HIGH =
  'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜø£Ø×ƒáíóúñÑªº¿®¬½¼¡«»' +
  '░▒▓│┤ÁÂÀ©╣║╗╝¢¥┐└┴┬├─┼ãÃ╚╔╩╦╠═╬¤ðÐÊËÈıÍÎÏ┘┌█▄¦Ì▀' +
  'ÓßÔÒõÕµþÞÚÛÙýÝ¯´­±‗¾¶§÷¸°¨·¹³²■ ';

export function decodeCp850(bytes: Uint8Array, start: number, len: number): string {
  let s = '';
  for (let i = start; i < start + len; i++) {
    const b = bytes[i];
    s += b < 0x80 ? String.fromCharCode(b) : CP850_HIGH[b - 0x80] ?? '�';
  }
  return s;
}

/** Lees een memo-blok (.DBT) op tekst, dBASE III/IV. */
function readMemo(memo: Uint8Array | undefined, blockNo: number, blockSize: number): string {
  if (!memo || !blockNo) return '';
  const offset = blockNo * blockSize;
  if (offset >= memo.length) return '';
  let end = offset;
  // tekst eindigt op 0x1A 0x1A (dBASE III) of een enkele 0x1A; anders einde bestand
  while (end < memo.length && !(memo[end] === 0x1a)) end++;
  return decodeCp850(memo, offset, end - offset).replace(/\x00+$/g, '');
}

/** Parse een DBF-bestand (met optioneel .DBT memo) naar velden + records. */
export function parseDbf(buf: Uint8Array, memo?: Uint8Array): DbfTable {
  const u16 = (o: number) => buf[o] | (buf[o + 1] << 8);
  const u32 = (o: number) => buf[o] | (buf[o + 1] << 8) | (buf[o + 2] << 16) | (buf[o + 3] << 24);

  const numRecords = u32(4);
  const headerSize = u16(8);
  const recordSize = u16(10);

  // memo-bloksgrootte: dBASE IV zet hem in de DBT-header (bytes 20-21), anders 512
  let memoBlockSize = 512;
  if (memo && memo.length >= 22) {
    const bs = memo[20] | (memo[21] << 8);
    if (bs > 0) memoBlockSize = bs;
  }

  // velddescriptors: vanaf byte 32, elk 32 bytes, tot terminator 0x0D
  const fields: DbfField[] = [];
  let p = 32;
  while (p < headerSize && buf[p] !== 0x0d) {
    let name = '';
    for (let i = 0; i < 11 && buf[p + i] !== 0; i++) name += String.fromCharCode(buf[p + i]);
    fields.push({
      name,
      type: String.fromCharCode(buf[p + 11]),
      length: buf[p + 16],
      decimals: buf[p + 17],
    });
    p += 32;
  }

  const records: DbfRecord[] = [];
  let rp = headerSize;
  for (let r = 0; r < numRecords; r++) {
    if (rp >= buf.length) break;
    const deleted = buf[rp] === 0x2a; // 0x2A = '*' verwijderd
    let fp = rp + 1;
    if (!deleted) {
      const rec: DbfRecord = {};
      for (const f of fields) {
        let val: string;
        if (f.type === 'M') {
          const raw = decodeCp850(buf, fp, f.length).trim();
          const blockNo = parseInt(raw, 10);
          val = isNaN(blockNo) ? '' : readMemo(memo, blockNo, memoBlockSize);
        } else {
          val = decodeCp850(buf, fp, f.length).trim();
        }
        rec[f.name] = val;
        fp += f.length;
      }
      records.push(rec);
    }
    rp += recordSize;
  }
  return { fields, records };
}

// ── Mapping naar het OCS-kostenmodel ───────────────────────────────────────

/** Eerste regel van een titel (de tool gebruikt \x11 als zachte regelovergang). */
function firstLine(s: string | undefined): string {
  if (!s) return '';
  return s.split(/[\x11\r\n]/)[0].trim();
}
function fullText(s: string | undefined): string {
  if (!s) return '';
  return s.replace(/\x11/g, '\n').replace(/\x00+/g, '').trim();
}

/** STABU-2 hoofdstuktitels (de in dit formaat voorkomende hoofdstukken). */
const STABU_CHAPTERS: Record<string, string> = {
  '21': 'BETONWERK',
  '22': 'METSELWERK',
  '23': 'VOORAF VERVAARDIGDE STEENACHTIGE ELEMENTEN',
  '24': 'RUWBOUWTIMMERWERK',
  '25': 'METAALCONSTRUCTIEWERK',
  '26': 'BOUWKUNDIGE KANALEN',
  '28': 'DAKBEDEKKINGEN (METAAL)',
  '30': 'KOZIJNEN, RAMEN EN DEUREN',
  '31': 'SYSTEEMBEKLEDINGEN',
  '32': 'TRAPPEN EN BALUSTRADEN',
  '33': 'DAKBEDEKKINGEN',
  '34': 'BEGLAZING',
  '35': 'NATUUR- EN KUNSTSTEEN',
  '36': 'VOEGVULLING',
  '40': 'STUKADOORWERK',
  '41': 'TEGELWERK',
  '42': 'DEKVLOEREN EN VLOERSYSTEMEN',
  '43': 'METAAL- EN KUNSTSTOFWERK',
  '44': 'PLAFOND- EN WANDSYSTEMEN',
  '45': 'AFBOUWTIMMERWERK',
  '46': 'SCHILDERWERK',
  '47': 'BINNENINRICHTING',
  '48': 'VLOER- EN TRAPAFWERKINGEN',
};
function chapterTitle(code2: string): { chapter: string; title: string } {
  const ch = (code2.match(/^(\d{2})/)?.[1]) ?? code2.slice(0, 2);
  return { chapter: ch, title: STABU_CHAPTERS[ch] ?? `HOOFDSTUK ${ch}` };
}

export interface DncImportResult {
  schedule: Partial<CostSchedule>;
  items: CostItem[];
  warnings: string[];
}

interface KuComponent {
  resourceType: ResourceType;
  normQuantity: number;
  normUnitPrice: number;
}
/**
 * Eén KU-rij kan meerdere kostencomponenten tegelijk dragen (bv. een receptregel
 * met zowel uren ALS materiaal). De OCS-regelformule is
 *   hoeveelheid = quantity(aantal) × normQuantity(productienorm) / normFactor(capaciteit)
 *   bedrag      = hoeveelheid × normUnitPrice
 * met quantity = HOEV1. Per niet-nul kolom dus één component:
 *   - arbeid (GETAL1 = uren-norm/eenheid): normQuantity = GETAL1, prijs = uurloon
 *   - materiaal (GETAL2) / materieel (GETAL3) / onderaanneming (GETAL4):
 *     normQuantity = 1, prijs = de eenheidsprijs
 */
function resourcesFromKu(ku: DbfRecord, uurloon: number): KuComponent[] {
  const g1 = parseNumber(ku.GETAL1), g2 = parseNumber(ku.GETAL2), g3 = parseNumber(ku.GETAL3), g4 = parseNumber(ku.GETAL4);
  const out: KuComponent[] = [];
  if (g1 > 0) out.push({ resourceType: 'arbeid', normQuantity: g1, normUnitPrice: uurloon });
  if (g2 > 0) out.push({ resourceType: 'materiaal', normQuantity: 1, normUnitPrice: g2 });
  if (g3 > 0) out.push({ resourceType: 'materieel', normQuantity: 1, normUnitPrice: g3 });
  if (g4 > 0) out.push({ resourceType: 'onderaannemer', normQuantity: 1, normUnitPrice: g4 });
  return out;
}

/**
 * Pure mapping: tabellen (gekeyd op 2-letter prefix) → OCS schedule + items.
 * Gesplitst van het uitpakken/inlezen zodat het met Node-geladen DBF-data
 * getest kan worden.
 */
export function buildDncImport(
  tables: Record<string, DbfRecord[]>,
  meta?: { projectName?: string },
): DncImportResult {
  const warnings: string[] = [];
  const KK = tables.KK ?? [];
  const KU = tables.KU ?? [];
  const VU = tables.VU ?? [];
  const VT = tables.VT ?? [];
  const VD = tables.VD ?? [];

  // uurloon (VU "0e uurtarief")
  const uurloon = parseNumber(VU.find(r => /0e uurtarief/i.test(r.OMSCHRIJF || ''))?.WAARDE) || 55;

  // KU per post-code (CODE2)
  const kuByCode = new Map<string, DbfRecord[]>();
  for (const r of KU) {
    const c = (r.CODE2 || '').trim();
    if (!c) continue;
    (kuByCode.get(c) ?? kuByCode.set(c, []).get(c)!).push(r);
  }
  // Hoeveel KK-posten delen dezelfde CODE2? (dan is de KU-koppeling ambigu)
  const kkCountByCode = new Map<string, number>();
  for (const r of KK) {
    const c = (r.CODE2 || '').trim();
    kkCountByCode.set(c, (kkCountByCode.get(c) ?? 0) + 1);
  }
  const kuUsed = new Set<string>();

  const items: CostItem[] = [];
  const chapterIdByCode = new Map<string, string>();
  let sort = 0;

  const ensureChapter = (code2: string): string => {
    const { chapter, title } = chapterTitle(code2);
    let id = chapterIdByCode.get(chapter);
    if (id) return id;
    id = genId();
    chapterIdByCode.set(chapter, id);
    items.push(makeCostItem({
      id, parentId: null, sortOrder: sort++, code: chapter, description: title,
      rowType: 'chapter', depth: 0, unit: 'st',
    }));
    return id;
  };

  for (const kk of KK) {
    const code2 = (kk.CODE2 || '').trim();
    const chapterId = ensureChapter(code2);
    const postId = genId();
    const hoev = parseNumber(kk.HOEV1);
    const tot1 = parseNumber(kk.TOT1), tot2 = parseNumber(kk.TOT2), tot4 = parseNumber(kk.TOT4);
    const totaal = parseNumber(kk.TOTAAL);

    items.push(makeCostItem({
      id: postId, parentId: chapterId, sortOrder: sort++,
      code: code2, description: firstLine(kk.TITEL) || '(geen omschrijving)',
      notes: fullText(kk.TITEL),
      rowType: 'begrotingspost', depth: 1,
      unit: normalizeUnit(kk.EENH), quantity: hoev || null,
    }));

    const kuList = kuByCode.get(code2);
    const ambiguous = (kkCountByCode.get(code2) ?? 0) > 1;

    if (kuList && kuList.length && !ambiguous) {
      // Detailregels uit KU (uniek gekoppeld) → exacte breakdown
      let rsort = 0;
      for (const ku of kuList) {
        const qh = parseNumber(ku.HOEV1);
        const comps = resourcesFromKu(ku, uurloon);
        const title = firstLine(ku.TITEL);
        if (comps.length === 0) {
          // "incl"-regel zonder bedrag: toon hem toch (informatief)
          items.push(makeCostItem({
            id: genId(), parentId: postId, sortOrder: rsort++, code: (ku.CATCODE || '').trim(),
            description: title, notes: fullText(ku.TITEL), rowType: 'regel', depth: 2,
            unit: normalizeUnit(ku.EENH), quantity: qh, normQuantity: 0, normFactor: 1, normDivisor: 1,
            normUnitPrice: 0, resourceType: 'overig',
          }));
          continue;
        }
        for (const c of comps) {
          // bij meerdere componenten op één bronregel het type erbij voor duidelijkheid
          const label = comps.length > 1 ? `${title} (${c.resourceType})` : title;
          items.push(makeCostItem({
            id: genId(), parentId: postId, sortOrder: rsort++,
            code: (ku.CATCODE || '').trim(),
            description: label,
            notes: fullText(ku.TITEL),
            rowType: 'regel', depth: 2,
            unit: normalizeUnit(ku.EENH),
            quantity: qh,                  // aantal
            normQuantity: c.normQuantity,  // productienorm (uren/eenheid voor arbeid, anders 1)
            normFactor: 1,                 // capaciteit
            normDivisor: 1,
            normUnitPrice: c.normUnitPrice,
            resourceType: c.resourceType,
          }));
        }
      }
      kuUsed.add(code2);
    } else {
      // Geen (eenduidige) KU-detail → samenvattende regels uit de KK-totalen,
      // zodat het posttotaal exact klopt (loon/materiaal/onderaanneming).
      if (ambiguous && kuList) warnings.push(`Post ${code2} deelt zijn code met een andere post; middelen samengevat i.p.v. gedetailleerd.`);
      let rsort = 0;
      const summary: Array<[ResourceType, number, string]> = [
        ['arbeid', tot1, 'Arbeid'],
        ['materiaal', tot2, 'Materiaal'],
        ['onderaannemer', tot4, 'Onderaanneming'],
      ];
      for (const [rt, amount, label] of summary) {
        if (!amount) continue;
        items.push(makeCostItem({
          id: genId(), parentId: postId, sortOrder: rsort++,
          description: label, rowType: 'regel', depth: 2, unit: normalizeUnit(kk.EENH),
          quantity: 1, normQuantity: 1, normFactor: 1, normDivisor: 1,
          normUnitPrice: amount, resourceType: rt,
        }));
      }
      if (rsort === 0 && totaal) {
        items.push(makeCostItem({
          id: genId(), parentId: postId, sortOrder: 0, description: 'Totaal',
          rowType: 'regel', depth: 2, unit: normalizeUnit(kk.EENH), quantity: 1,
          normQuantity: 1, normFactor: 1, normDivisor: 1, normUnitPrice: totaal,
          resourceType: 'overig',
        }));
      }
    }
  }

  // ── Schedule: tarief, staart, kengetallen ──
  const schedule: Partial<CostSchedule> = {
    name: meta?.projectName || 'DNC-import',
    projectName: meta?.projectName || 'DNC-import',
    tarieven: { A: uurloon },
  };

  // Staartpercentages uit VT (op omschrijving)
  const vtPct = (re: RegExp): number | undefined => {
    const row = VT.find(r => re.test(r.OMSCHRIJF || ''));
    return row ? parseNumber(row.WAARDE) : undefined;
  };
  const ak = vtPct(/algemene kosten/i);
  const wr = vtPct(/winst.*risico/i);
  const ukk = vtPct(/co.?rdinatie|uitvoering/i);
  if (ak != null) schedule.algemeneKosten = ak;
  if (wr != null) schedule.winstRisico = wr;
  if (ukk != null) schedule.uitvoeringskosten = ukk;

  // Projectkengetallen uit VD (>0)
  const props = VD.filter(r => parseNumber(r.WAARDE) > 0 && (r.OMSCHRIJF || '').trim())
    .map(r => ({
      id: genId(),
      name: (r.OMSCHRIJF || '').trim(),
      value: parseNumber(r.WAARDE),
      unit: /m2|m²/i.test(r.OMSCHRIJF || '') ? 'm²' : /m3|m³/i.test(r.OMSCHRIJF || '') ? 'm³' : '',
      isDefault: false,
    }));
  if (props.length) schedule.projectProperties = props;

  if (!KK.length) warnings.push('Geen KK-tabel (posten) gevonden in het .DNC-bestand.');
  return { schedule, items, warnings };
}

// ── Importeur-wrapper: 7z uitpakken + DBF lezen ────────────────────────────

/** Tabel-prefixes die we nodig hebben voor de begroting (rest negeren = snel). */
const NEEDED_PREFIXES = ['KK', 'KU', 'VU', 'VT', 'VD'];

/**
 * Lees een .DNC-bestand (7z-archief met dBASE-tabellen) en bouw de begroting.
 * Het 7z-uitpakken gebeurt met 7z-wasm (lazy geladen; de wasm-URL wordt door
 * Vite gebundeld zodat het in de browser én de desktop-webview werkt).
 */
export async function importDncFile(
  buffer: ArrayBuffer,
  fileName?: string,
): Promise<{ schedule: Partial<CostSchedule>; items: CostItem[]; warnings: string[] }> {
  const SevenZipFactory = (await import('7z-wasm')).default;
  const wasmUrl = (await import('7z-wasm/7zz.wasm?url')).default;
  const sz = await SevenZipFactory({
    locateFile: () => wasmUrl,
    print: () => {},
    printErr: () => {},
  });

  sz.FS.writeFile('archive.dnc', new Uint8Array(buffer));
  sz.callMain(['x', 'archive.dnc', '-y']);

  const entries: string[] = sz.FS.readdir('/').filter((f: string) => /\.DBF$/i.test(f));
  const tables: Record<string, DbfRecord[]> = {};
  let innerName = '';
  for (const f of entries) {
    const prefix = f.slice(0, 2).toUpperCase();
    if (!NEEDED_PREFIXES.includes(prefix)) continue;
    const dbf: Uint8Array = sz.FS.readFile(f);
    let memo: Uint8Array | undefined;
    try { memo = sz.FS.readFile(f.replace(/\.DBF$/i, '.DBT')); } catch { /* geen memo */ }
    tables[prefix] = parseDbf(dbf, memo).records;
    innerName = f.slice(2).replace(/\.DBF$/i, '');
  }

  const projectName = (fileName || innerName || 'DNC-import').replace(/\.dnc$/i, '');
  return buildDncImport(tables, { projectName });
}
