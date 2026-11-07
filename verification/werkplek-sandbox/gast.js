// De gastpagina van de nagebootste werkplek (oorsprong B): houdt de bestanden
// "in Docs" in het geheugen, beantwoordt de brug in het frame (brug.js) en
// laat zien wat er over de brug gaat. Zoals ouder.ts van de SuperCloud: alleen
// berichten van het eigen iframe met origin "null" tellen; het antwoord gaat
// met "*" naar precies dat frame; bytes als overgedragen ArrayBuffer.
//
// Query: ?bestand=<id> (startbestand, standaard DOC-1; leeg = geen),
//        &taal=nl&thema=light (naar de app via de hash), &zwijg=<ms> (de
//        gastpagina "laadt later": zo lang geen antwoord op hallo).
'use strict';

const CFG = window.WERKPLEK_CONFIG;
const zoek = new URLSearchParams(location.search);
const BESTAND = zoek.has('bestand') ? zoek.get('bestand') : 'DOC-1';
const TAAL = zoek.get('taal') || 'nl';
const THEMA = zoek.get('thema') || 'light';
const ZWIJG_MS = Number(zoek.get('zwijg') || 0);
const OUDER = zoek.get('ouder') || location.origin; // voor de controle met een verkeerde ouder
// Een sessiecookie van de klantsite: die mag nooit in het iframe of bij een verzoek van de bundel komen.
document.cookie = 'sessie=geheim; path=/';

// De ingelogde gebruiker en "de ander". Storage zet de voornaam (User.first_name) in de naam van een conflictkopie.
const IK = { email: 'anna@klant.example', voornaam: 'Anna' };
const ANDER = { email: 'piet@klant.example', voornaam: 'Piet' };

// Een bestand: `alleen_lezen` = geen schrijfrecht (met de foutcode van storage als reden), `slot` = wie het
// vergrendelde (Opslagvergrendeling), `versies[k]` = volgnummer k+1 (Bestandsversie: het eerste is 1).
const docs = {};
for (const [id, d] of Object.entries(CFG.documenten)) docs[id] = { naam: d.naam, alleen_lezen: !!d.alleen_lezen, foutcode: d.foutcode ?? null, slot: null, versies: [] };
const instellingen = new Map();
const MODIFIED_0 = '2026-10-01 08:00:00';
// Zoals de werkplek (issue #2 van openaec-storage, en ouder.ts in de proef van Open PDF Studio): `open`, `opslaan` en
// `versies` alleen voor het bestand van de pagina, een bestand uit `lijst`, of wat opslaan zelf maakte.
const toegestaan = new Set(BESTAND ? [BESTAND] : []);
// Zoals sessie.ts van de werkplek (weigerVersie): na open met `versie` weigert opslaan tot een open zonder versie.
const versieOpen = new Map();

// De vaste meldingen van storage bij een weigering met foutcode (rechten.py, api.py, mapsjablonen.py).
const STORAGE_MELDINGEN = {
  ruimte_gearchiveerd: 'Deze ruimte is gearchiveerd en alleen te lezen. Vraag een beheerder om hem terug te zetten.',
  alleen_lezen_deling: 'Dit is met je gedeeld om te bekijken; wijzigen kan niet',
  deling_ingetrokken: 'Deze deling is ingetrokken; je hebt hier geen toegang meer',
  deling_verlopen: 'Deze deling is verlopen; je hebt hier geen toegang meer',
  quotum_ruimte_vol: 'Het quotum van deze ruimte (1 GB) is vol',
  quotum_pool_vol: 'Het opslagquotum van deze omgeving is vol',
  map_alleen_lezen: 'De map Begrotingen is alleen te lezen; alleen een beheerder van de ruimte kan hier iets wijzigen',
};
const GEEN_TOEGANG = 'Geen toegang tot deze plek'; // vereis_op_plek zonder foutcode

const gast = window.__gast = {
  log: [], opgeslagen: [], opgeslagenAls: [], geweigerd: [], geopend: [], meldingen: [], start: 0, eersteAntwoord: null, appSoorten: [],
  conflictVolgende: false, slotVolgende: false, weigerVolgende: null,
  overzicht() {
    return Object.fromEntries(Object.entries(docs).map(([id, d]) => [id, { naam: d.naam, alleenLezen: d.alleen_lezen, slot: d.slot?.email ?? null, versies: d.versies.length, bytes: d.versies.at(-1)?.bytes.length ?? 0 }]));
  },
  tekst(id) { const v = docs[id]?.versies.at(-1); return v ? new TextDecoder().decode(v.bytes) : null; },
  instellingen() { return Object.fromEntries(instellingen); },
};

const $ = (s) => document.querySelector(s);
const houder = $('#frame-houder');
let app = null;
const frame = () => app?.contentWindow ?? null;

function fout(tekst, code) { const f = new Error(tekst); if (code) f.code = code; return f; }
class MetOverdracht { constructor(waarde, lijst) { this.waarde = waarde; this.lijst = lijst; } }
const twee = (n) => String(n).padStart(2, '0');
/** Plaatselijke tijd als "YYYY-MM-DD HH:MM:SS" (de datetime van Frappe, zonder microseconden). */
function nu(d = new Date()) {
  return `${d.getFullYear()}-${twee(d.getMonth() + 1)}-${twee(d.getDate())} ${twee(d.getHours())}:${twee(d.getMinutes())}:${twee(d.getSeconds())}`;
}

// ── Zoals openaec-storage (openaec_storage/api.py, namen.py) ────────────────
/** Een id zoals autoname "hash" van Frappe (Opslagbestand): tien hextekens. */
function nieuwId() {
  let id;
  do { id = [...crypto.getRandomValues(new Uint8Array(5))].map((b) => b.toString(16).padStart(2, '0')).join(''); } while (docs[id]);
  return id;
}
/** os.path.splitext: de extensie vanaf de laatste punt (niet een punt aan het begin). */
function splitext(naam) {
  const i = naam.lastIndexOf('.');
  const eerste = naam.search(/[^.]/); // punten aan het begin tellen niet
  return eerste >= 0 && i > eerste ? [naam.slice(0, i), naam.slice(i)] : [naam, ''];
}
const actief = (naam) => Object.values(docs).some((d) => d.naam === naam);
/**
 * _conflictnaam in api.py: "<stam> (conflict <voornaam> <YYYY-MM-DD HHMM>)<ext>", bij een bestaande naam met een
 * teller vanaf 2 erachter: "<stam> (conflict <voornaam> <YYYY-MM-DD HHMM> 2)<ext>".
 */
function conflictnaam(naam) {
  const [stam, ext] = splitext(naam);
  const d = new Date();
  const moment = `${d.getFullYear()}-${twee(d.getMonth() + 1)}-${twee(d.getDate())} ${twee(d.getHours())}${twee(d.getMinutes())}`;
  let kandidaat = `${stam} (conflict ${IK.voornaam} ${moment})${ext}`;
  for (let teller = 2; actief(kandidaat); teller++) kandidaat = `${stam} (conflict ${IK.voornaam} ${moment} ${teller})${ext}`;
  return kandidaat;
}
/** _vrije_naam in api.py: "naam (2).ext", "naam (3).ext", … */
function vrijeNaam(naam) {
  const [stam, ext] = splitext(naam);
  let kandidaat = naam;
  for (let teller = 2; actief(kandidaat); teller++) kandidaat = `${stam} (${teller})${ext}`;
  return kandidaat;
}
/** namen.ongeldige_naam: de reden, of null. */
function ongeldigeNaam(naam) {
  if (naam === '' || naam === '.' || naam === '..') return 'de naam is leeg';
  if (naam.length > 255) return 'de naam is langer dan 255 tekens';
  for (const teken of naam) {
    if ('<>:"/\\|?*'.includes(teken)) return `het teken ${teken} kan niet in een naam`;
    if (teken.charCodeAt(0) < 32) return 'een naam kan geen controleteken bevatten';
  }
  if ('. '.includes(naam.at(-1))) return 'een naam kan niet op een punt of spatie eindigen';
  const apparaat = naam.split('.', 1)[0].replace(/ +$/, '').toUpperCase();
  if (/^(CON|PRN|AUX|NUL|CONIN\$|CONOUT\$|COM[0-9¹²³]|LPT[0-9¹²³])$/.test(apparaat)) return `${naam.split('.', 1)[0].replace(/ +$/, '')} is een gereserveerde naam op Windows`;
  return null;
}
/** cint van Frappe: een geheel getal, anders 0; leeg blijft null (basis_versie in (None, "")). */
function basisVersie(waarde) {
  if (waarde === undefined || waarde === null || waarde === '') return null;
  const n = Number.parseInt(String(waarde), 10);
  return Number.isNaN(n) ? 0 : n;
}

// ── Het werk van de host ─────────────────────────────────────────────────────
function doc(id) {
  const d = docs[id];
  if (!d) throw fout('Bestand bestaat niet');
  return d;
}
/** Het bestand van een verzoek, alleen als de werkplek het deze pagina toestaat. */
function toegestaanDoc(bestand) {
  const id = String(bestand);
  if (!toegestaan.has(id)) throw fout('Dit bestand mag deze pagina niet openen.');
  return [id, doc(id)];
}
const slotVanAnder = (d) => !!d.slot && d.slot.email !== IK.email;

async function voerUit(v) {
  switch (v.soort) {
    case 'hallo':
      gast.appSoorten = Array.isArray(v.soorten) ? v.soorten.filter((s) => typeof s === 'string') : [];
      return true;
    case 'open': {
      const [id, d] = toegestaanDoc(v.bestand);
      if (v.versie != null) {
        // Zoals ouder.ts: alleen een geheel getal vanaf 1; altijd alleen-lezen, zonder slot.
        if (typeof v.versie !== 'number' || !Number.isInteger(v.versie) || v.versie < 1) throw fout('Ongeldig versienummer.', 'versie_ongeldig');
        if (v.versie > d.versies.length) throw fout('Deze versie bestaat niet of je hebt er geen toegang toe.');
        versieOpen.set(id, v.versie);
        const bytes = d.versies[v.versie - 1].bytes.slice().buffer;
        return new MetOverdracht({ bestand: id, naam: d.naam, versie: v.versie, alleen_lezen: true, bytes }, [bytes]);
      }
      versieOpen.delete(id);
      const bytes = d.versies.at(-1).bytes.slice().buffer;
      // Alleen-lezen zonder schrijfrecht, of als een ander het vergrendelde ("iemand anders bewerkt het",
      // openaec-storage#11); `versie` is het volgnummer (Opslagbestand.huidige_versie).
      return new MetOverdracht({ bestand: id, naam: d.naam, versie: d.versies.length, alleen_lezen: d.alleen_lezen || slotVanAnder(d), bytes }, [bytes]);
    }
    case 'opslaan': {
      const [id, d] = toegestaanDoc(v.bestand);
      if (versieOpen.has(id)) throw fout(`Versie ${versieOpen.get(id)} is alleen-lezen geopend; open de huidige versie om op te slaan.`, 'versie_alleen_lezen');
      if (!(v.bytes instanceof ArrayBuffer)) throw fout('Geen bestand ontvangen.');
      const bytes = new Uint8Array(v.bytes);
      // Zoals upload_start/upload_klaar: eerst de rechten, het archief en het quotum (een weigering met foutcode),
      // pas daarna de conflictregel van _registreer.
      if (d.alleen_lezen) {
        gast.geweigerd.push({ bestand: id, code: d.foutcode });
        throw fout(STORAGE_MELDINGEN[d.foutcode] ?? GEEN_TOEGANG, d.foutcode ?? undefined);
      }
      if (gast.weigerVolgende) {
        const code = gast.weigerVolgende;
        gast.weigerVolgende = null;
        $('#weiger').value = '';
        gast.geweigerd.push({ bestand: id, code });
        throw fout(STORAGE_MELDINGEN[code] ?? GEEN_TOEGANG, code);
      }
      if (gast.conflictVolgende) {
        // Iemand anders sloeg intussen op: de basisversie van de app is niet meer de huidige.
        gast.conflictVolgende = false;
        $('#conflict').checked = false;
        d.versies.push({ bytes: d.versies.at(-1).bytes, modified: nu(), author: ANDER.email });
      }
      if (gast.slotVolgende) {
        // Een ander vergrendelde het bestand intussen (Opslagvergrendeling): de versie klopt nog wel.
        gast.slotVolgende = false;
        $('#slot').checked = false;
        d.slot = ANDER;
      }
      // _registreer: een nieuwe versie alleen als basis_versie de huidige versie is en geen ander het vergrendelde;
      // anders (ook zonder basis_versie) een conflictkopie naast het origineel, een nieuw bestand met versie 1.
      const basis = basisVersie(v.verwachte_versie);
      const reden = slotVanAnder(d) ? 'slot' : basis === null ? 'geen_basis' : basis !== d.versies.length ? 'verouderd' : null;
      if (reden) {
        const naam = conflictnaam(d.naam);
        const kopieId = nieuwId();
        docs[kopieId] = { naam, alleen_lezen: false, foutcode: null, slot: null, versies: [{ bytes, modified: nu(), author: IK.email }] };
        toegestaan.add(kopieId);
        gast.opgeslagen.push({ bestand: id, doel: kopieId, naam, verwachteVersie: v.verwachte_versie, lengte: bytes.length, conflict: true, reden });
        const waarom = reden === 'slot' ? `${d.slot.voornaam} bewerkt dit bestand` : 'Iemand anders sloeg dit bestand intussen op';
        return { bestand: kopieId, naam, versie: 1, conflict: true, vergrendeld: true, melding: `${waarom}. Jouw versie staat in ${naam}.` };
      }
      d.versies.push({ bytes, modified: nu(), author: IK.email });
      gast.opgeslagen.push({ bestand: id, doel: id, naam: d.naam, verwachteVersie: v.verwachte_versie, lengte: bytes.length, conflict: false, reden: null });
      return { bestand: id, naam: d.naam, versie: d.versies.length, conflict: false, vergrendeld: true, melding: null };
    }
    case 'opslaan_als': {
      if (!(v.bytes instanceof ArrayBuffer)) throw fout('Geen bestand ontvangen.');
      const naam = String(v.naam ?? '').trim();
      // _controleer_naam (namen.py), dan de soort: de werkplek bewaart alleen het eigen formaat van de tool (in storage
      // de mapregel `extensies`, code extensie_niet_toegestaan).
      const reden = ongeldigeNaam(naam);
      if (reden) throw fout(`Ongeldige naam: ${reden}`, 'ongeldige_naam');
      if (!/\.ifcCalc$/i.test(naam)) throw fout('In de map Begrotingen zijn alleen deze bestandssoorten toegestaan: .ifcCalc', 'extensie_niet_toegestaan');
      const definitief = vrijeNaam(naam);
      const id = nieuwId();
      const bytes = new Uint8Array(v.bytes);
      docs[id] = { naam: definitief, alleen_lezen: false, foutcode: null, slot: null, versies: [{ bytes, modified: nu(), author: IK.email }] };
      toegestaan.add(id);
      gast.opgeslagenAls.push({ id, naam, definitief, lengte: bytes.length });
      return { bestand: id, naam: definitief, versie: 1, hernoemd: definitief !== naam };
    }
    case 'lijst': {
      // bladeren() geeft per bestand {name, naam, grootte, huidige_versie, mime, modified}, op naam; de werkplek
      // geeft de app {id, name, modified}.
      const lijst = Object.entries(docs).sort(([, a], [, b]) => (a.naam < b.naam ? -1 : a.naam > b.naam ? 1 : 0))
        .map(([id, d]) => ({ id, name: d.naam, modified: d.versies.at(-1)?.modified ?? MODIFIED_0 }));
      for (const b of lijst) toegestaan.add(b.id);
      return lijst;
    }
    case 'versies': {
      // versies() in api.py: {volgnummer, grootte, sha256, bron, maker, creation}, nieuwste eerst ("volgnummer
      // desc"); de werkplek geeft de app {version, modified, author}.
      const [, d] = toegestaanDoc(v.bestand);
      return d.versies.map((x, i) => ({ version: i + 1, modified: x.modified, author: x.author })).reverse();
    }
    case 'geopend':
      gast.geopend.push(String(v.bestand));
      return true;
    case 'melding':
      gast.meldingen.push({ tekst: String(v.tekst ?? ''), toon: v.toon ?? 'fout' });
      return true;
    case 'instelling.lees':
      return instellingen.has(String(v.sleutel)) ? instellingen.get(String(v.sleutel)) : null;
    case 'instelling.zet':
      instellingen.set(String(v.sleutel), v.waarde ?? null);
      return true;
    case 'instelling.wis':
      instellingen.delete(String(v.sleutel));
      return true;
    default:
      throw fout('Onbekend verzoek: ' + v.soort, 'onbekende_soort');
  }
}

function antwoord(id, inhoud, overdracht = []) {
  // Een opaque frame heeft geen oorsprong om op te richten: "*", alleen aan dit frame.
  frame()?.postMessage({ werkplek: 1, antwoord: id, ...inhoud }, '*', overdracht);
}

// ── Verzoeken aan de app (de assistent) ─────────────────────────────────────
let volgendAppId = 1_000_000;
const wachtendApp = new Map();
function vraagApp(soort, velden = {}) {
  const f = frame();
  if (!f) return Promise.reject(new Error('Er is geen frame.'));
  return new Promise((klaar, mis) => {
    const id = volgendAppId++;
    const timer = setTimeout(() => { wachtendApp.delete(id); mis(new Error('Time-out: de app antwoordt niet op ' + soort)); }, 120_000);
    wachtendApp.set(id, { klaar, mis, timer, soort, t0: performance.now() });
    noteerLog({ t: tijd(), richting: 'app', soort, velden, bezig: true, id });
    f.postMessage({ werkplek: 1, id, soort, ...velden }, '*');
  });
}
window.werkplek = {
  tools: () => vraagApp('app.tools'),
  definities: () => vraagApp('app.definities'),
  run: (naam, argumenten = {}) => vraagApp('app.run', { naam, argumenten }),
  bestanden: () => gast.overzicht(),
  log: gast.log,
  host: gast,
  herlaad: () => maakFrame(),
};

// ── Berichten ────────────────────────────────────────────────────────────────
const tijd = () => Math.round(performance.now() - gast.start);
function samenvatting(v) {
  const uit = {};
  for (const [k, w] of Object.entries(v)) {
    if (['werkplek', 'id', 'soort'].includes(k)) continue;
    uit[k] = w instanceof ArrayBuffer ? `<${w.byteLength} bytes>` : w;
  }
  const s = JSON.stringify(uit);
  return s === '{}' ? '' : s.slice(0, 160);
}

window.addEventListener('message', async (e) => {
  // Zoals ouder.ts: alleen ons eigen iframe, en dat is opaque ("null").
  if (!frame() || e.source !== frame() || e.origin !== 'null') return;
  const v = e.data;
  if (!v || v.werkplek !== 1) return;
  if (typeof v.antwoord === 'number') {
    const w = wachtendApp.get(v.antwoord);
    if (!w) return;
    wachtendApp.delete(v.antwoord);
    clearTimeout(w.timer);
    const duur = Math.round(performance.now() - w.t0);
    if (v.ok === true) { noteerLog({ t: tijd(), richting: 'app', soort: w.soort, ok: true, duur, waarde: v.waarde }); w.klaar(v.waarde); }
    else { const f = fout(String(v.fout ?? 'onbekende fout'), v.code); noteerLog({ t: tijd(), richting: 'app', soort: w.soort, ok: false, duur, fout: f.message, code: v.code }); w.mis(f); }
    return;
  }
  if (typeof v.soort !== 'string') return;
  const t = tijd();
  const regel = { t, id: v.id, soort: v.soort, bestand: v.bestand, versie: v.versie, verwachteVersie: v.verwachte_versie, naam: v.naam, sleutel: v.sleutel,
    bytes: v.bytes instanceof ArrayBuffer ? v.bytes.byteLength : undefined };
  gast.log.push(regel);
  if (performance.now() - gast.start < ZWIJG_MS) { if (v.soort !== 'hallo') noteerLog({ t, richting: 'host', soort: v.soort, velden: samenvatting(v), fout: 'gastpagina zwijgt nog' }); return; }
  const eersteHallo = v.soort === 'hallo' && gast.eersteAntwoord === null;
  if (eersteHallo) gast.eersteAntwoord = t;
  const t0 = performance.now();
  try {
    const uitkomst = await voerUit(v);
    const waarde = uitkomst instanceof MetOverdracht ? uitkomst.waarde : uitkomst;
    regel.ok = true;
    if (uitkomst instanceof MetOverdracht) antwoord(v.id, { ok: true, waarde }, uitkomst.lijst);
    else antwoord(v.id, { ok: true, waarde });
    if (eersteHallo) { toonStatus(); laadToolnamen(); }
    if (v.soort !== 'hallo') noteerLog({ t, richting: 'host', soort: v.soort, velden: samenvatting(v), ok: true, duur: Math.round(performance.now() - t0), waarde: waarde instanceof Object && 'bytes' in waarde ? { ...waarde, bytes: `<${waarde.bytes.byteLength} bytes>` } : waarde });
  } catch (f) {
    regel.ok = false; regel.fout = f.message;
    antwoord(v.id, { ok: false, fout: f.message, ...(typeof f.code === 'string' ? { code: f.code } : {}) });
    noteerLog({ t, richting: 'host', soort: v.soort, velden: samenvatting(v), ok: false, fout: f.message, code: f.code });
  }
  toonBestanden();
});

// ── Weergave ─────────────────────────────────────────────────────────────────
const logLijst = $('#log');
function noteerLog(r) {
  const li = document.createElement('li');
  li.className = (r.richting === 'app' ? 'app ' : '') + (r.ok === false ? 'fout' : '');
  const pijl = r.richting === 'app' ? '→ app' : '← host';
  let s = `${pijl} ${r.soort} ${r.velden ? (typeof r.velden === 'string' ? r.velden : JSON.stringify(r.velden).slice(0, 160)) : ''}`;
  if (r.bezig) s += ' …';
  else if (r.ok === false) s += `  ✖ ${r.fout}${r.code ? ` [${r.code}]` : ''}${r.duur != null ? ` (${r.duur} ms)` : ''}`;
  else if (r.ok === true) s += `  ✔${r.duur != null ? ` ${r.duur} ms` : ''}${r.waarde !== undefined && r.waarde !== true ? ' ' + JSON.stringify(r.waarde).slice(0, 140) : ''}`;
  li.innerHTML = `<span class="t">${r.t} ms</span>`;
  li.appendChild(document.createTextNode(s));
  logLijst.prepend(li);
  while (logLijst.children.length > 300) logLijst.lastChild.remove();
}

function toonStatus() {
  const s = $('#status');
  if (gast.eersteAntwoord === null) { s.textContent = 'wachten…'; s.className = ''; }
  else { s.textContent = `verbonden na ${gast.eersteAntwoord} ms; app-soorten: ${gast.appSoorten.join(', ') || 'geen'}`; s.className = 'verbonden'; }
}

function toonBestanden() {
  const tbody = $('#bestanden tbody');
  tbody.textContent = '';
  for (const [id, d] of Object.entries(gast.overzicht())) {
    const tr = document.createElement('tr');
    const cellen = [id, d.naam + (d.alleenLezen ? ' (alleen-lezen)' : ''), String(d.versies), String(d.bytes)];
    cellen.forEach((tekst, i) => { const td = document.createElement('td'); td.textContent = tekst; if (i >= 2) td.className = 'num'; tr.appendChild(td); });
    const td = document.createElement('td');
    const knop = document.createElement('button');
    knop.type = 'button'; knop.textContent = 'start hiermee'; knop.title = 'De pagina herladen met dit bestand als initialFileId';
    knop.addEventListener('click', () => { const u = new URL(location.href); u.searchParams.set('bestand', id); location.href = u.href; });
    td.appendChild(knop); tr.appendChild(td);
    tbody.appendChild(tr);
  }
}

function toonUitvoer(waarde) {
  const s = typeof waarde === 'string' ? waarde : JSON.stringify(waarde, null, 2);
  $('#uitvoer').textContent = s.length > 20_000 ? s.slice(0, 20_000) + '\n… (afgekapt)' : s;
}
async function voerToolUit(soort, velden) {
  toonUitvoer('…');
  try { toonUitvoer(await vraagApp(soort, velden)); }
  catch (f) { toonUitvoer(`✖ ${f.message}${f.code ? ` [${f.code}]` : ''}`); }
}
for (const knop of document.querySelectorAll('button[data-soort], button[data-tool]')) {
  knop.addEventListener('click', () => {
    if (knop.dataset.soort) return void voerToolUit(knop.dataset.soort, {});
    const argumenten = knop.dataset.args ? JSON.parse(knop.dataset.args) : {};
    void voerToolUit('app.run', { naam: knop.dataset.tool, argumenten });
  });
}
$('#vrij').addEventListener('submit', (e) => {
  e.preventDefault();
  let argumenten = {};
  const raw = $('#vrij-args').value.trim();
  if (raw) { try { argumenten = JSON.parse(raw); } catch (f) { return toonUitvoer('✖ argumenten zijn geen JSON: ' + f.message); } }
  void voerToolUit('app.run', { naam: $('#vrij-naam').value.trim(), argumenten });
});
$('#herlaad').addEventListener('click', () => maakFrame());
$('#conflict').addEventListener('change', (e) => { gast.conflictVolgende = e.target.checked; });
$('#slot').addEventListener('change', (e) => { gast.slotVolgende = e.target.checked; });
$('#weiger').addEventListener('change', (e) => { gast.weigerVolgende = e.target.value || null; });

// ── Het frame ────────────────────────────────────────────────────────────────
function maakFrame() {
  app?.remove();
  for (const w of wachtendApp.values()) { clearTimeout(w.timer); w.mis(new Error('Het frame is herladen.')); }
  wachtendApp.clear();
  gast.eersteAntwoord = null; gast.appSoorten = [];
  toonStatus();
  app = document.createElement('iframe');
  app.id = 'wp-app';
  app.name = 'ocs-app';
  app.setAttribute('sandbox', CFG.SANDBOX);
  app.setAttribute('credentialless', '');
  const hash = new URLSearchParams({ ouder: OUDER, app: 'calc', ...(BESTAND ? { bestand: BESTAND } : {}), taal: TAAL, thema: THEMA });
  app.src = CFG.APP + CFG.APP_PAD + 'index.html#' + hash.toString();
  gast.start = performance.now();
  houder.appendChild(app);
  $('#frame-info').textContent = `sandbox="${CFG.SANDBOX}" credentialless, ${app.src}`;
}

/** Na de handdruk: de toolnamen voor het invulveld. */
function laadToolnamen() {
  vraagApp('app.tools').then((namen) => {
    const dl = $('#toolnamen'); dl.textContent = '';
    for (const n of namen) { const o = document.createElement('option'); o.value = n; dl.appendChild(o); }
  }).catch(() => {});
}

(async () => {
  // De begininhoud van de bestanden komt van de server (zelfde oorsprong); daarna leeft alles hier.
  await Promise.all(Object.keys(docs).map(async (id) => {
    const r = await fetch('/werkplek/doc/' + encodeURIComponent(id));
    if (!r.ok) throw new Error('Geen begininhoud voor ' + id);
    docs[id].versies.push({ bytes: new Uint8Array(await r.arrayBuffer()), modified: MODIFIED_0, author: 'beheer@klant.example' });
  }));
  toonBestanden();
  maakFrame();
})();
