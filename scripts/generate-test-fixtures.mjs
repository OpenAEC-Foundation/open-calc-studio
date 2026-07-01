/**
 * Genereert geanonimiseerde test-begrotingen in de ondersteunde importformaten.
 * Volledig SYNTHETISCH (verzonnen projecten/posten) — geen herleidbare data.
 *
 *   node scripts/generate-test-fixtures.mjs
 *
 * Output: test/fixtures/import-formats/  (10 bestanden: .ifcCalc, .dnc, .xtb, .rsx, .xls)
 * De fixtures worden door src/test/fixtures.test.ts geverifieerd via de echte importeurs.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');
const OUT = path.join(REPO, 'test', 'fixtures', 'import-formats');
fs.mkdirSync(OUT, { recursive: true });

const ISO = '2025-01-15T10:00:00.000Z'; // vast tijdstip → deterministisch
let idc = 0;
const id = (p) => `${p}-${(++idc).toString(36)}`;
const guid = (n) => 'g'.padEnd(22, String.fromCharCode(65 + (n % 26)));

// ── Synthetische, geanonimiseerde begrotingen ──────────────────────────────
// Een handvol generieke bouwprojecten met fictieve namen.
const PROJECTS = [
  { naam: 'Nieuwbouw woning Lindelaan', nummer: 'TST-001', opdr: 'Familie Dijkstra', plaats: 'Bloemendorp', auteur: 'A. Calculator' },
  { naam: 'Renovatie kantoorpand Beukstraat', nummer: 'TST-002', opdr: 'Bouwbedrijf Voorbeeld B.V.', plaats: 'Veenstede', auteur: 'B. Rekenaar' },
  { naam: 'Aanbouw schoolgebouw De Esdoorn', nummer: 'TST-003', opdr: 'Stichting Onderwijs Noord', plaats: 'Zandwijk', auteur: 'C. Begroter' },
  { naam: 'Verbouwing bedrijfshal Wilgenweg', nummer: 'TST-004', opdr: 'Logistiek Demo N.V.', plaats: 'Polderdam', auteur: 'D. Kostendeskundige' },
  { naam: 'Sloop en herbouw garage Iepenhof', nummer: 'TST-005', opdr: 'V.O.F. Testklant', plaats: 'Duinrust', auteur: 'E. Raming' },
];

// Generieke bouwposten met loon/materiaal/onderaanneming-split (per eenheid).
// loon = uren/eh, mat = €/eh, oa = €/eh.
const CHAPTERS = [
  {
    code: '01', titel: 'GRONDWERK', posten: [
      { code: '01.01', titel: 'Ontgraven bouwput', hoev: 240, eh: 'm3', mid: [
        { t: 'Ontgraven machinaal', hoev: 240, eh: 'm3', uren: 0.05, mat: 0, oa: 0 },
        { t: 'Afvoer grond', hoev: 240, eh: 'm3', uren: 0, mat: 0, oa: 12.5 },
      ] },
      { code: '01.02', titel: 'Aanvullen en verdichten', hoev: 90, eh: 'm3', mid: [
        { t: 'Zand aanvullen', hoev: 90, eh: 'm3', uren: 0.08, mat: 18, oa: 0 },
      ] },
    ],
  },
  {
    code: '02', titel: 'BETONWERK', posten: [
      { code: '02.01', titel: 'Fundering gewapend beton', hoev: 45, eh: 'm3', mid: [
        { t: 'Beton C30/37', hoev: 45, eh: 'm3', uren: 0, mat: 120, oa: 0 },
        { t: 'Storten en verdichten', hoev: 45, eh: 'm3', uren: 2.5, mat: 0, oa: 0 },
        { t: 'Wapening', hoev: 3600, eh: 'kg', uren: 0, mat: 0, oa: 1.45 },
      ] },
      { code: '02.02', titel: 'Vloer op zand', hoev: 180, eh: 'm2', mid: [
        { t: 'Betonvloer 150mm', hoev: 180, eh: 'm2', uren: 0.3, mat: 22, oa: 0 },
      ] },
    ],
  },
  {
    code: '03', titel: 'RUWBOUW', posten: [
      { code: '03.01', titel: 'Metselwerk gevel', hoev: 320, eh: 'm2', mid: [
        { t: 'Metselwerk baksteen', hoev: 320, eh: 'm2', uren: 1.1, mat: 35, oa: 0 },
        { t: 'Mortel', hoev: 320, eh: 'm2', uren: 0, mat: 4.5, oa: 0 },
      ] },
      { code: '03.02', titel: 'Kanaalplaatvloer verdieping', hoev: 150, eh: 'm2', mid: [
        { t: 'Kanaalplaten leveren+leggen', hoev: 150, eh: 'm2', uren: 0, mat: 0, oa: 48 },
      ] },
    ],
  },
  {
    code: '04', titel: 'AFBOUW', posten: [
      { code: '04.01', titel: 'Binnendeuren stomp', hoev: 18, eh: 'st', mid: [
        { t: 'Binnendeur + kozijn', hoev: 18, eh: 'st', uren: 1.5, mat: 185, oa: 0 },
        { t: 'Hang- en sluitwerk', hoev: 18, eh: 'st', uren: 0.5, mat: 45, oa: 0 },
      ] },
      { code: '04.02', titel: 'Tegelwerk badkamer', hoev: 60, eh: 'm2', mid: [
        { t: 'Wandtegels zetten', hoev: 60, eh: 'm2', uren: 0.9, mat: 32, oa: 0 },
      ] },
    ],
  },
];
const UURLOON = 55;

// Bereken bedragen per post/middel (loon = uren*uurloon, mat = €, oa = €).
function midAmount(m) {
  return m.hoev * (m.uren * UURLOON + m.mat + m.oa);
}
function postTotal(p) {
  return p.mid.reduce((s, m) => s + midAmount(m), 0);
}
function chapterTotal(c) {
  return c.posten.reduce((s, p) => s + postTotal(p), 0);
}
function grandTotal(chapters) {
  return chapters.reduce((s, c) => s + chapterTotal(c), 0);
}

// Kies een subset hoofdstukken voor variatie tussen bestanden.
const variant = (n) => CHAPTERS.slice(0, n);

// ════════════════════════════════════════════════════════════════════════
// 1) .ifcCalc (native JSON, formaat 2.2.0)
// ════════════════════════════════════════════════════════════════════════
function ocsItem(p) {
  return {
    id: id('i'), parentId: null, sortOrder: 0, code: '', description: '', unit: 'st',
    quantity: null, materialPrice: null, laborPrice: null, unitPrice: 0, total: 0,
    isCollapsed: false, depth: 0, notes: '', ifcGuid: guid(idc), rowType: 'begrotingspost',
    staartPercentage: null, nr: '', normQuantity: null, normFactor: null, normDivisor: null,
    normUnitPrice: null, resourceType: null, resourceLibraryId: null, verrekenbaar: null,
    tariefGroep: null, ...p,
  };
}
function writeIfcCalc(file, proj, chapters, opts = {}) {
  idc = 0;
  const items = [];
  for (const c of chapters) {
    const ch = ocsItem({ code: c.code, description: c.titel, rowType: 'chapter', depth: 0, verrekenbaar: 'V' });
    items.push(ch);
    for (const p of c.posten) {
      const post = ocsItem({ parentId: ch.id, code: p.code, description: p.titel, rowType: 'begrotingspost', depth: 1, unit: p.eh, quantity: p.hoev });
      items.push(post);
      for (const m of p.mid) {
        // Eén regel per niet-nul component (een middel kan tegelijk uren + materiaal dragen).
        const comps = [];
        if (m.uren > 0) comps.push({ rt: 'arbeid', nq: m.uren, nup: UURLOON });
        if (m.mat > 0) comps.push({ rt: 'materiaal', nq: 1, nup: m.mat });
        if (m.oa > 0) comps.push({ rt: 'onderaannemer', nq: 1, nup: m.oa });
        for (const co of comps) {
          items.push(ocsItem({
            parentId: post.id, description: comps.length > 1 ? `${m.t} (${co.rt})` : m.t,
            rowType: 'regel', depth: 2, unit: m.eh, quantity: m.hoev,
            normQuantity: co.nq, normFactor: 1, normDivisor: 1, normUnitPrice: co.nup,
            resourceType: co.rt,
          }));
        }
      }
    }
  }
  const schedule = {
    id: id('sch'), name: proj.naam, description: opts.desc || 'Synthetische testbegroting',
    status: 'DRAFT', predefinedType: 'BUDGET', currency: 'EUR',
    projectName: proj.naam, projectNumber: proj.nummer, client: proj.opdr, author: proj.auteur,
    ifcGuid: guid(99), uitvoeringskosten: 0, algemeneKosten: 7, winstRisico: 4,
    tarieven: { A: UURLOON, B: 48, C: 62 },
    ...(opts.metrics ? {
      projectProperties: [
        { id: id('pp'), name: 'Bruto vloeroppervlak', value: 420, unit: 'm²', isDefault: true },
        { id: id('pp'), name: 'Woningen', value: 4, unit: 'st', isDefault: false },
      ],
    } : {}),
  };
  const file2 = {
    version: '2.2.0', schedule, items, resourceLibrary: [],
    companyInfo: { name: 'Demo Bouw B.V.', postalAddress: 'Voorbeeldweg 1', postalCity: 'Teststad', email: 'info@example.test' },
    spreadsheets: { sheets: [], activeSheetId: null },
    createdAt: ISO, modifiedAt: ISO,
  };
  fs.writeFileSync(path.join(OUT, file), JSON.stringify(file2, null, 2));
  return grandTotal(chapters);
}

// ════════════════════════════════════════════════════════════════════════
// 2) .dnc (7z-archief met dBASE-tabellen KK/KU/VU/VT/VD)
// ════════════════════════════════════════════════════════════════════════
function writeDbf(fields, records) {
  const recordSize = 1 + fields.reduce((s, f) => s + f.len, 0);
  const headerSize = 32 + fields.length * 32 + 1;
  const buf = Buffer.alloc(headerSize + records.length * recordSize + 1);
  buf[0] = 0x03;
  buf[1] = 125; buf[2] = 1; buf[3] = 15; // datum 2025-01-15 (yy,mm,dd)
  buf.writeUInt32LE(records.length, 4);
  buf.writeUInt16LE(headerSize, 8);
  buf.writeUInt16LE(recordSize, 10);
  let p = 32;
  for (const f of fields) {
    buf.write(f.name.slice(0, 11), p, 'ascii');
    buf[p + 11] = 0x43; // 'C'
    buf[p + 16] = f.len;
    p += 32;
  }
  buf[p++] = 0x0d;
  for (const rec of records) {
    buf[p++] = 0x20;
    for (const f of fields) {
      const v = String(rec[f.name] ?? '').slice(0, f.len).padEnd(f.len, ' ');
      buf.write(v, p, 'ascii');
      p += f.len;
    }
  }
  buf[p] = 0x1a;
  return buf;
}

async function writeDnc(file, proj, chapters) {
  const suffix = 'Test'; // KK<suffix>.DBF etc.
  // KK = posten (CODE2 = code, TITEL, HOEV1, EENH, TOTAAL, TOT1 loon, TOT2 mat, TOT4 oa)
  const kkFields = [
    { name: 'CODE1', len: 8 }, { name: 'CODE2', len: 20 }, { name: 'SOORT', len: 1 },
    { name: 'TITEL', len: 60 }, { name: 'HOEV1', len: 12 }, { name: 'EENH', len: 4 },
    { name: 'TOTAAL', len: 14 }, { name: 'TOT1', len: 14 }, { name: 'TOT2', len: 14 },
    { name: 'TOT3', len: 14 }, { name: 'TOT4', len: 14 }, { name: 'TOT5', len: 14 }, { name: 'TOT9', len: 14 },
  ];
  const kuFields = [
    { name: 'CODE2', len: 20 }, { name: 'SOORT', len: 1 }, { name: 'TITEL', len: 60 },
    { name: 'HOEV1', len: 12 }, { name: 'EENH', len: 4 }, { name: 'GETAL1', len: 12 },
    { name: 'GETAL2', len: 12 }, { name: 'GETAL3', len: 12 }, { name: 'GETAL4', len: 12 },
    { name: 'GETAL9', len: 12 }, { name: 'CATCODE', len: 14 },
  ];
  const kk = [], ku = [];
  for (const c of chapters) {
    for (const p of c.posten) {
      const loon = p.mid.reduce((s, m) => s + m.hoev * m.uren * UURLOON, 0);
      const mat = p.mid.reduce((s, m) => s + m.hoev * m.mat, 0);
      const oa = p.mid.reduce((s, m) => s + m.hoev * m.oa, 0);
      kk.push({
        CODE1: proj.nummer, CODE2: p.code, SOORT: 'K', TITEL: p.titel,
        HOEV1: String(p.hoev), EENH: p.eh,
        TOTAAL: (loon + mat + oa).toFixed(2), TOT1: loon.toFixed(2), TOT2: mat.toFixed(2),
        TOT3: '0', TOT4: oa.toFixed(2), TOT5: '0', TOT9: '0',
      });
      let n = 0;
      for (const m of p.mid) {
        ku.push({
          CODE2: p.code, SOORT: 'P', TITEL: m.t, HOEV1: String(m.hoev), EENH: m.eh,
          GETAL1: m.uren ? String(m.uren) : '0',
          GETAL2: m.mat ? String(m.mat) : '0',
          GETAL3: '0',
          GETAL4: m.oa ? String(m.oa) : '0',
          GETAL9: '0', CATCODE: `R${p.code}.${++n}`,
        });
      }
    }
  }
  const vu = [{ LABEL: 'ALG', NUMMER: '0', OMSCHRIJF: '0e uurtarief', WAARDE: UURLOON.toFixed(2) }];
  const vt = [
    { LABEL: 'ALG', NUMMER: '02', WAARDE: '7.00', OMSCHRIJF: 'Algemene Kosten' },
    { LABEL: 'ALG', NUMMER: '03', WAARDE: '4.00', OMSCHRIJF: 'Winst en risico' },
    { LABEL: 'ALG', NUMMER: '05', WAARDE: '21.00', OMSCHRIJF: 'B.T.W.' },
  ];
  const vd = [
    { LABEL: 'ALG', NUMMER: '0', OMSCHRIJF: 'Bruto M2', WAARDE: '420.00' },
    { LABEL: 'ALG', NUMMER: '2', OMSCHRIJF: 'Woningen', WAARDE: '4.00' },
  ];
  const vuFields = [{ name: 'LABEL', len: 4 }, { name: 'NUMMER', len: 4 }, { name: 'OMSCHRIJF', len: 30 }, { name: 'WAARDE', len: 14 }];
  const vtFields = [{ name: 'LABEL', len: 4 }, { name: 'NUMMER', len: 4 }, { name: 'WAARDE', len: 14 }, { name: 'OMSCHRIJF', len: 30 }];
  const vdFields = vuFields;

  const tables = {
    [`KK${suffix}.DBF`]: writeDbf(kkFields, kk),
    [`KU${suffix}.DBF`]: writeDbf(kuFields, ku),
    [`VU${suffix}.DBF`]: writeDbf(vuFields, vu),
    [`VT${suffix}.DBF`]: writeDbf(vtFields, vt),
    [`VD${suffix}.DBF`]: writeDbf(vdFields, vd),
  };

  const SevenZip = require('7z-wasm');
  const sz = await SevenZip({ print: () => {}, printErr: () => {} });
  for (const [name, buf] of Object.entries(tables)) sz.FS.writeFile(name, new Uint8Array(buf));
  sz.callMain(['a', '-t7z', 'out.dnc', ...Object.keys(tables)]);
  fs.writeFileSync(path.join(OUT, file), Buffer.from(sz.FS.readFile('out.dnc')));
  return grandTotal(chapters);
}

// ════════════════════════════════════════════════════════════════════════
// 3) .xtb (SQLite, IBIS-TRAD schema)
// ════════════════════════════════════════════════════════════════════════
async function writeXtb(file, proj, chapters) {
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs({ locateFile: () => path.join(REPO, 'node_modules/sql.js/dist/sql-wasm.wasm') });
  const db = new SQL.Database();
  db.run(`
    CREATE TABLE Begrotingen (Naam TEXT, Datum TEXT, Omschrijving TEXT, NettoTotaal REAL, BrutoTotaal REAL, TotaalUren REAL);
    CREATE TABLE BegrotingsRegels (Id INTEGER, ParentId INTEGER, Regelnummer INTEGER, Type INTEGER, CalculatieCode TEXT, Omschrijving TEXT, Multipliciteit REAL);
    CREATE TABLE Kostenposten (Id INTEGER, MiddelId INTEGER, Hoeveelheid REAL, Eenheidsprijs REAL, NettoArbeid REAL, NettoMateriaal REAL, NettoMaterieel REAL, NettoOnderaanneming REAL, NettoTotaal REAL, ProductieFactor REAL, Uren REAL);
    CREATE TABLE Middelen (MiddelId INTEGER, MiddelCode TEXT, Omschrijving TEXT, Eenheid TEXT, NormUren REAL, UurNormType TEXT, EenheidsprijsMateriaal REAL, EenheidsprijsMaterieel REAL, EenheidsprijsOnderaanneming REAL);
    CREATE TABLE Elementen (Id INTEGER, Eenheid TEXT, Hoeveelheid REAL, NettoTotaal REAL);
  `);
  const total = grandTotal(chapters);
  db.run('INSERT INTO Begrotingen VALUES (?,?,?,?,?,?)', [proj.naam, '2025-01-15', proj.nummer, total, total, 0]);

  let rid = 1, mid = 1, reg = 0;
  db.run('INSERT INTO BegrotingsRegels VALUES (?,?,?,?,?,?,?)', [1, null, reg++, 0, '', '', 1]); // synthetische root
  const rootId = 1; rid = 2;
  for (const c of chapters) {
    const chId = rid++;
    db.run('INSERT INTO BegrotingsRegels VALUES (?,?,?,?,?,?,?)', [chId, rootId, reg++, 0, c.code, c.titel, 1]);
    for (const p of c.posten) {
      for (const m of p.mid) {
        const leafId = rid++;
        const loon = m.hoev * m.uren * UURLOON, materiaal = m.hoev * m.mat, oa = m.hoev * m.oa;
        const netto = loon + materiaal + oa;
        db.run('INSERT INTO BegrotingsRegels VALUES (?,?,?,?,?,?,?)', [leafId, chId, reg++, 2, p.code, m.t, 1]);
        const myMid = mid++;
        db.run('INSERT INTO Middelen VALUES (?,?,?,?,?,?,?,?,?)', [myMid, `M${myMid}`, m.t, m.eh, m.uren, 'A', m.mat, 0, m.oa]);
        db.run('INSERT INTO Kostenposten VALUES (?,?,?,?,?,?,?,?,?,?,?)',
          [leafId, myMid, m.hoev, netto / (m.hoev || 1), loon, materiaal, 0, oa, netto, 1, m.hoev * m.uren]);
      }
    }
  }
  fs.writeFileSync(path.join(OUT, file), Buffer.from(db.export()));
  db.close();
  return total;
}

// ════════════════════════════════════════════════════════════════════════
// 4) .rsx (RAW bestek XML)
// ════════════════════════════════════════════════════════════════════════
function esc(s) { return String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c])); }
function writeRsx(file, proj, chapters) {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<RAWBestand>\n  <Bestek><Naam>${esc(proj.naam)}</Naam></Bestek>\n`;
  for (const c of chapters) {
    xml += `  <Deelraming code="${esc(c.code)}" omschrijving="${esc(c.titel)}">\n`;
    for (const p of c.posten) {
      const prijs = postTotal(p) / (p.hoev || 1);
      xml += `    <Resultaatsverplichting besteksnummer="${esc(p.code)}">\n`;
      xml += `      <Omschrijving>${esc(p.titel)}</Omschrijving>\n`;
      xml += `      <Hoeveelheid>${p.hoev}</Hoeveelheid>\n`;
      xml += `      <Eenheid>${esc(p.eh)}</Eenheid>\n`;
      xml += `      <Prijs>${prijs.toFixed(2)}</Prijs>\n`;
      xml += `    </Resultaatsverplichting>\n`;
    }
    xml += `  </Deelraming>\n`;
  }
  xml += `</RAWBestand>\n`;
  fs.writeFileSync(path.join(OUT, file), xml);
  return grandTotal(chapters);
}

// ════════════════════════════════════════════════════════════════════════
// 5) .xls (BasCalc: Menu / Eindblad / Kostprijs)
// ════════════════════════════════════════════════════════════════════════
function writeXls(file, proj, chapters) {
  const XLSX = require('xlsx');
  const wb = XLSX.utils.book_new();

  const menu = [[], ['Projectnaam', proj.naam], ['Projectnummer', proj.nummer], ['Opdrachtgever', proj.opdr], ['Calculator', proj.auteur]];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(menu), 'Menu');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Eindblad'], ['Aanneemsom', grandTotal(chapters)]]), 'Eindblad');

  // Kostprijs: A=rijtype, C=code, D=oms, I=hoev, J=eh, K=S(h/m), M=ehprijs, N=bedrag
  const rows = [['rijtype', '', 'code', 'omschrijving', '', '', '', '', 'hoev', 'eh', 'S', '', 'ehprijs', 'bedrag']];
  const cell = (a, c, d, i, j, k, m, n) => { const r = new Array(14).fill(''); r[0] = a; r[2] = c; r[3] = d; r[8] = i; r[9] = j; r[10] = k; r[12] = m; r[13] = n; return r; };
  for (const c of chapters) {
    rows.push(cell('ih', c.code, c.titel, '', '', '', '', ''));
    for (const p of c.posten) {
      const loon = p.mid.reduce((s, m) => s + m.hoev * m.uren * UURLOON, 0);
      const mat = p.mid.reduce((s, m) => s + m.hoev * (m.mat + m.oa), 0);
      const tot = loon + mat;
      // post als 'ih' met sub-code (depth>=3 → begrotingspost)
      const postCode = `${c.code}.${p.code.split('.').pop()}.1`;
      rows.push(cell('ih', postCode, p.titel, p.hoev, p.eh, mat >= loon ? 'm' : 'h', (tot / (p.hoev || 1)).toFixed(2), tot.toFixed(2)));
    }
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Kostprijs');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xls' });
  fs.writeFileSync(path.join(OUT, file), buf);
  return grandTotal(chapters);
}

// ── Genereer de 10 bestanden ───────────────────────────────────────────────
const manifest = [];
const rec = (file, total) => { manifest.push({ file, total: Math.round(total) }); console.log(`✓ ${file}  (≈ €${Math.round(total).toLocaleString('nl-NL')})`); };

rec('01-ifccalc-klein.ifcCalc', writeIfcCalc('01-ifccalc-klein.ifcCalc', PROJECTS[0], variant(2)));
rec('02-ifccalc-staart.ifcCalc', writeIfcCalc('02-ifccalc-staart.ifcCalc', PROJECTS[1], variant(3), { desc: 'Met staartkosten' }));
rec('03-ifccalc-kengetallen.ifcCalc', writeIfcCalc('03-ifccalc-kengetallen.ifcCalc', PROJECTS[2], variant(4), { metrics: true }));
rec('04-dnc-stabu.dnc', await writeDnc('04-dnc-stabu.dnc', PROJECTS[0], variant(3)));
rec('05-dnc-stabu-groot.dnc', await writeDnc('05-dnc-stabu-groot.dnc', PROJECTS[3], variant(4)));
rec('06-xtb-ibis.xtb', await writeXtb('06-xtb-ibis.xtb', PROJECTS[1], variant(3)));
rec('07-xtb-ibis-groot.xtb', await writeXtb('07-xtb-ibis-groot.xtb', PROJECTS[4], variant(4)));
rec('08-rsx-raw.rsx', writeRsx('08-rsx-raw.rsx', PROJECTS[2], variant(3)));
rec('09-rsx-raw-klein.rsx', writeRsx('09-rsx-raw-klein.rsx', PROJECTS[0], variant(2)));
rec('10-xls-bascalc.xls', writeXls('10-xls-bascalc.xls', PROJECTS[3], variant(3)));

fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`\n${manifest.length} fixtures geschreven naar ${path.relative(REPO, OUT)}`);
