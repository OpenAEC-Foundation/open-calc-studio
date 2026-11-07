// Een nagebootste werkplek van de OpenAEC SuperCloud voor de platformbouw van
// Open Calc Studio (issue #61, laatste vinkje van de checklist).
//
// Zoals de echte host (openaec-bench, frontend/apps/werkplek/src/gast/ouder.ts,
// nagebootst in open-pdf-studio/scripts/werkplek-proef.mjs):
//  - de bundel (dist/, base ./) staat onder een subpad, /werkplek/app/calc/, op
//    oorsprong A (http://127.0.0.1:<poortApp>), met op elk bestand de koppen van
//    de host: de CSP met de sandbox en zonder 'self' (werkplekCsp),
//    Access-Control-Allow-Origin: *, CORP cross-origin, nosniff en
//    Referrer-Policy no-referrer;
//  - de brug van de host staat op oorsprong A onder /werkplek/app/brug/ (de CSP
//    laat die map toe als script-src); de host zet hem als eerste script in
//    index.html, vóór de bundel, zodat `window.openaecHost` er staat voordat de
//    app start (brug.js);
//  - de gastpagina /werkplek/calc staat op oorsprong B (http://localhost:<poortGast>,
//    Referrer-Policy same-origin) en laadt de bundel in
//      <iframe sandbox="allow-scripts allow-downloads allow-modals" credentialless>
//    met #ouder=<B>&app=calc&bestand=<id>&taal=nl&thema=light: een opaque
//    origin ("null"), geen opslag, geen cookies;
//  - de gastpagina telt alleen berichten van haar eigen iframe met origin
//    "null" en antwoordt met "*" aan dat frame; bytes gaan als overgedragen
//    ArrayBuffer; de bestanden leven in het geheugen van de gastpagina, de
//    server levert alleen de begininhoud (/werkplek/doc/<id>).
//
// Daarnaast, alleen voor de tegenproef: dezelfde bundel zonder sandbox en zonder
// CSP onder /los/ op oorsprong A (daar hoort de knop "Tweede scherm" wél te staan).
//
// Draaien:  node verification/werkplek-sandbox/server.mjs   (Ctrl+C stopt)
// Poorten:  WERKPLEK_POORT_APP (3671) en WERKPLEK_POORT_GAST (3672).

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = path.dirname(fileURLToPath(import.meta.url));
export const WORTEL = path.resolve(HIER, '..', '..');

export const APP_PAD = '/werkplek/app/calc/';
export const BRUG_PAD = '/werkplek/app/brug/';
export const BRUG_BESTAND = 'openaec-host-brug.js';
export const GAST_PAD = '/werkplek/calc';
export const LOS_PAD = '/los/';

/** De sandbox van de werkplek: zonder allow-same-origin, dus een opaque origin. */
export const WERKPLEK_SANDBOX = 'allow-scripts allow-downloads allow-modals';

/**
 * Het beleid op elk app-document in de werkplek, zoals de host het zet
 * (csp_app in openaec_werkplek/oorsprong.py, overgenomen uit de proef van
 * Open PDF Studio): de sandbox, geen 'self', alles alleen binnen de absolute
 * bundel-URL, plus de map van de brug.
 */
export function werkplekCsp(bundelUrl, klantOrigin, brugUrl = null) {
  return [
    `sandbox ${WERKPLEK_SANDBOX}`,
    "default-src 'none'",
    `script-src ${bundelUrl}${brugUrl ? ` ${brugUrl}` : ''} 'wasm-unsafe-eval'`,
    `worker-src ${bundelUrl} blob:`,
    `style-src ${bundelUrl} 'unsafe-inline'`,
    `img-src ${bundelUrl} data: blob:`,
    `font-src ${bundelUrl} data:`,
    `media-src ${bundelUrl} data: blob:`,
    `connect-src ${bundelUrl}`,
    `frame-ancestors ${klantOrigin}`,
    "form-action 'none'",
    "base-uri 'none'",
    "object-src 'none'",
  ].join('; ');
}

const SOORTEN = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ico': 'image/x-icon', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
  '.map': 'application/json', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.ifccalc': 'application/json', '.md': 'text/markdown; charset=utf-8', '.csv': 'text/csv; charset=utf-8',
};
const soortVan = (bestand) => SOORTEN[path.extname(bestand).toLowerCase()] || 'application/octet-stream';

/** De voorbeeldbegrotingen uit de bundel als bestanden "in Docs". */
export function standaardDocumenten(bundel = path.join(WORTEL, 'dist')) {
  const map = fs.existsSync(path.join(bundel, 'data', 'voorbeeld.ifcCalc')) ? path.join(bundel, 'data') : path.join(WORTEL, 'public', 'data');
  const lees = (naam) => new Uint8Array(fs.readFileSync(path.join(map, naam)));
  return {
    'DOC-1': { naam: 'Voorbeeldbegroting.ifcCalc', bytes: lees('voorbeeld.ifcCalc') },
    'DOC-2': { naam: 'Sample estimate.ifcCalc', bytes: lees('sample-en.ifcCalc') },
    // In een gearchiveerde ruimte: lezen mag, opslaan weigert storage met de foutcode ruimte_gearchiveerd.
    'DOC-RO': { naam: 'Archief 2025.ifcCalc', bytes: lees('voorbeeld.ifcCalc'), alleenLezen: true, foutcode: 'ruimte_gearchiveerd' },
  };
}

function luister(handler, poort, host) {
  return new Promise((klaar, mis) => {
    const s = http.createServer((req, res) => {
      Promise.resolve(handler(req, res)).catch((e) => { try { res.writeHead(500).end(String(e)); } catch { /* al gesloten */ } });
    });
    s.once('error', mis);
    s.listen(poort, host, () => klaar(s));
  });
}

function veiligPad(wortel, rel) {
  const bestand = path.resolve(wortel, rel);
  if (!bestand.startsWith(wortel + path.sep) || !fs.existsSync(bestand) || !fs.statSync(bestand).isFile()) return null;
  return bestand;
}

/**
 * Start de nagebootste werkplek.
 * @param {object} [o]
 * @param {string} [o.bundel]     map met de platformbouw (dist/)
 * @param {number} [o.poortApp]   oorsprong A: http://127.0.0.1:<poortApp>
 * @param {number} [o.poortGast]  oorsprong B: http://localhost:<poortGast>
 * @param {{ [id: string]: { naam: string, bytes: Uint8Array, alleenLezen?: boolean, foutcode?: string } }} [o.documenten]
 */
export async function startWerkplek({ bundel = path.join(WORTEL, 'dist'), poortApp = 3671, poortGast = 3672, documenten = standaardDocumenten(bundel) } = {}) {
  const wortel = path.resolve(bundel);
  if (!fs.existsSync(path.join(wortel, 'index.html'))) {
    throw new Error(`Geen platformbouw in ${wortel}: draai eerst "npm run build:platform".`);
  }
  const APP = `http://127.0.0.1:${poortApp}`;
  const GAST = `http://localhost:${poortGast}`;
  const bundelUrl = `${APP}${APP_PAD}`;
  const brugUrl = `${APP}${BRUG_PAD}`;
  const csp = werkplekCsp(bundelUrl, GAST, brugUrl);
  const appKoppen = {
    'Content-Security-Policy': csp,
    'Access-Control-Allow-Origin': '*',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-store',
  };
  const verzoeken = { app: [], gast: [] };

  // De host zet zijn brug als eerste script in index.html: zo staat
  // `window.openaecHost` er vóór de start van de bundel (het hostcontract).
  const indexMetBrug = () => {
    const html = fs.readFileSync(path.join(wortel, 'index.html'), 'utf8');
    return html.replace(/<head>/i, `<head>\n    <script src="${BRUG_PAD}${BRUG_BESTAND}"></script>`);
  };

  // Oorsprong A: de bundel (met de koppen van de host), de brug, en /los/ voor de tegenproef.
  async function appServer(req, res) {
    const url = new URL(req.url, APP);
    const pad = decodeURIComponent(url.pathname);
    verzoeken.app.push({ pad, origin: req.headers.origin ?? null, cookie: req.headers.cookie ?? null });
    if (pad.startsWith(BRUG_PAD)) {
      const bestand = veiligPad(HIER, pad.slice(BRUG_PAD.length) === BRUG_BESTAND ? 'brug.js' : '\u0000');
      if (!bestand) return res.writeHead(404, appKoppen).end('niet gevonden');
      res.writeHead(200, { 'Content-Type': SOORTEN['.js'], ...appKoppen });
      return fs.createReadStream(bestand).pipe(res);
    }
    const los = pad.startsWith(LOS_PAD);
    const basis = los ? LOS_PAD : APP_PAD;
    if (!pad.startsWith(basis)) return res.writeHead(404, appKoppen).end('niet gevonden');
    const rel = pad.slice(basis.length) || 'index.html';
    const koppen = los ? { 'Cache-Control': 'no-store' } : appKoppen;
    if (rel === 'index.html' && !los) {
      return res.writeHead(200, { 'Content-Type': SOORTEN['.html'], ...koppen }).end(indexMetBrug());
    }
    const bestand = veiligPad(wortel, rel);
    if (!bestand) return res.writeHead(404, koppen).end('niet gevonden');
    res.writeHead(200, { 'Content-Type': soortVan(bestand), ...koppen });
    return fs.createReadStream(bestand).pipe(res);
  }

  // Oorsprong B: de klantsite met de gastpagina.
  const docsVoorGast = Object.fromEntries(Object.entries(documenten).map(([id, d]) => [id, { naam: d.naam, alleen_lezen: !!d.alleenLezen, foutcode: d.foutcode ?? null }]));
  async function gastServer(req, res) {
    const url = new URL(req.url, GAST);
    const p = decodeURIComponent(url.pathname);
    verzoeken.gast.push({ pad: p, origin: req.headers.origin ?? null });
    const koppen = { 'Referrer-Policy': 'same-origin', 'Cache-Control': 'no-store' };
    const stuur = (type, inhoud) => res.writeHead(200, { 'Content-Type': type, ...koppen }).end(inhoud);
    if (p === GAST_PAD || p === GAST_PAD + '/') return stuur(SOORTEN['.html'], fs.readFileSync(path.join(HIER, 'gast.html'), 'utf8'));
    if (p === '/werkplek/gast.js') return stuur(SOORTEN['.js'], fs.readFileSync(path.join(HIER, 'gast.js'), 'utf8'));
    if (p === '/werkplek/config.js') {
      const config = { APP, APP_PAD, SANDBOX: WERKPLEK_SANDBOX, documenten: docsVoorGast };
      return stuur(SOORTEN['.js'], `window.WERKPLEK_CONFIG = ${JSON.stringify(config)};\n`);
    }
    if (p.startsWith('/werkplek/doc/')) {
      // Alleen voor de gastpagina zelf (zelfde oorsprong, geen CORS-kop).
      const doc = documenten[p.slice('/werkplek/doc/'.length)];
      if (!doc) return res.writeHead(404, koppen).end();
      return res.writeHead(200, { 'Content-Type': 'application/octet-stream', ...koppen }).end(Buffer.from(doc.bytes));
    }
    return res.writeHead(404, koppen).end('niet gevonden');
  }

  const servers = [];
  servers.push(await luister(appServer, poortApp, '127.0.0.1'));
  servers.push(await luister(gastServer, poortGast, '127.0.0.1'));
  // localhost kan in de browser ook ::1 zijn.
  try { servers.push(await luister(gastServer, poortGast, '::1')); } catch { /* geen IPv6 */ }

  /** Het adres van de gastpagina; opties gaan als query mee (zie gast.js). */
  const gastAdres = (opties = {}) => {
    const q = new URLSearchParams(Object.entries(opties).map(([k, v]) => [k, String(v)]));
    return `${GAST}${GAST_PAD}${q.size ? `?${q}` : ''}`;
  };

  return {
    APP, GAST, bundelUrl, brugUrl, losUrl: `${APP}${LOS_PAD}`, csp, verzoeken, gastAdres,
    sluit: async () => {
      for (const s of servers) {
        s.closeAllConnections?.();
        await new Promise((r) => s.close(() => r()));
      }
    },
  };
}

// Zelfstandig gestart: draaien tot Ctrl+C.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const poortApp = Number(process.env.WERKPLEK_POORT_APP || 3671);
  const poortGast = Number(process.env.WERKPLEK_POORT_GAST || 3672);
  const bundel = process.argv[2] ? path.resolve(process.argv[2]) : path.join(WORTEL, 'dist');
  startWerkplek({ bundel, poortApp, poortGast }).then((w) => {
    console.log(`Werkplek gestart.\n  Gastpagina (open dit):  ${w.gastAdres()}\n  Bundel (oorsprong A):   ${w.bundelUrl}\n  Zonder sandbox (proef): ${w.losUrl}\n  CSP: ${w.csp}\nCtrl+C stopt.`);
    const stop = () => { w.sluit().finally(() => process.exit(0)); };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  }).catch((e) => { console.error(e.message); process.exit(2); });
}
