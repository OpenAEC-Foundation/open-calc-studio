// De brug van de werkplek, in het frame van de app: `window.openaecHost` over
// postMessage naar de gastpagina (de nagebootste SuperCloud, zie server.mjs).
//
// De host zet dit script als eerste in index.html, vóór de bundel. Het frame
// heeft een opaque origin, dus de gastpagina kan `openaecHost` niet van buiten
// neerzetten; dit script doet het van binnen, in de vorm van het contract
// (OpenAEC-Blueprint docs/supercloud-koppeling.md, src/services/file/siteHost.ts).
//
// Het protocol volgt de brug van Open PDF Studio (js/core/host-brug.js) en
// de werkplek van de SuperCloud:
//  - Verzoek:  { werkplek: 1, id: <getal>, soort: <tekst>, ...velden }
//  - Antwoord: { werkplek: 1, antwoord: <id>, ok: true,  waarde: … }
//              { werkplek: 1, antwoord: <id>, ok: false, fout: '<melding>'[, code] }
//  - Handdruk: elke 250 ms "hallo" tot de gastpagina antwoordt; na 60 s opgeven.
//    Hallo noemt in `soorten` wat de app zelf beantwoordt (app.*).
//  - Soorten naar de gastpagina:
//      open { bestand, versie? }              -> { bestand, naam, versie, alleen_lezen, bytes }
//      opslaan { bestand, bytes, verwachte_versie? } -> { bestand, naam, versie, conflict, melding, vergrendeld }
//                                             (een conflict: een kopie met een ander `bestand`)
//      opslaan_als { naam, bytes }            -> { bestand, naam, versie, hernoemd }
//      lijst {}                               -> [{ id, name, modified }]
//      versies { bestand }                    -> [{ version, modified, author }], nieuwste eerst
//      geopend { bestand }                    -> true (ter informatie)
//      instelling.lees/zet/wis { sleutel, waarde? } -> de waarde (eigen uitbreiding
//                                                voor `settings` van het contract)
//  - De andere kant op: de gastpagina vraagt de app, voor de assistent, met
//    dezelfde vorm: app.tools {}, app.definities {}, app.run { naam, argumenten? }
//    (window.__OPDS_APP__).
//
// Strikt op oorsprong: `ouder` uit de hash alleen als scheme://host[:poort];
// location.ancestorOrigins[0] moet `ouder` zijn; alleen berichten met
// event.source === window.parent én event.origin === ouder tellen; we sturen
// alleen naar `ouder`.
(function () {
  'use strict';
  var WERKPLEK = 1;
  var HALLO_INTERVAL_MS = 250;
  var HALLO_OPGEVEN_MS = 60000;
  var VERZOEK_TIMEOUT_MS = 120000;
  var APP_SOORTEN = ['app.tools', 'app.definities', 'app.run'];

  if (!window.parent || window.parent === window) return;
  var params = new URLSearchParams((location.hash || '').replace(/^#/, ''));
  var ouder = params.get('ouder');
  if (!isGeldigeOorsprong(ouder)) return;
  var app = params.get('app');
  if (app !== null && app !== 'calc') return;
  var voorouders = location.ancestorOrigins;
  if (voorouders && typeof voorouders.length === 'number' && (voorouders.length < 1 || voorouders[0] !== ouder)) {
    console.warn('[brug] de pagina erboven is niet ' + ouder + '; de brug start niet');
    return;
  }
  var bestand = params.get('bestand');
  var taal = params.get('taal');
  var thema = params.get('thema');

  function isGeldigeOorsprong(waarde) {
    if (typeof waarde !== 'string' || !waarde) return false;
    try { var u = new URL(waarde); return (u.protocol === 'http:' || u.protocol === 'https:') && u.origin === waarde; } catch (e) { return false; }
  }
  function hostFout(melding, code) {
    var f = new Error(melding);
    if (code) { f.code = code; f.hostCode = code; }
    return f;
  }
  function eigenBuffer(bytes) {
    if (bytes instanceof ArrayBuffer) return bytes.slice(0);
    if (ArrayBuffer.isView(bytes)) return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    throw hostFout('Nothing to save', 'ongeldige_argumenten');
  }

  var volgendId = 1;
  var wachtend = new Map();
  var halloIds = new Set();
  var toestand = 'wacht'; // wacht | verbonden | opgegeven
  var verbondenNa = null;
  var start = performance.now();
  var verbindingKlaar, verbindingMis;
  var verbinding = new Promise(function (klaar, mis) { verbindingKlaar = klaar; verbindingMis = mis; });
  verbinding.catch(function () {});

  function stuur(bericht, overdracht) {
    if (overdracht && overdracht.length) window.parent.postMessage(bericht, ouder, overdracht);
    else window.parent.postMessage(bericht, ouder);
  }

  function verzoek(soort, velden, overdracht) {
    return verbinding.then(function () {
      return new Promise(function (klaar, mis) {
        var id = volgendId++;
        var timer = setTimeout(function () {
          wachtend.delete(id);
          mis(hostFout('The page around Open Calc Studio did not answer (' + soort + ')', 'time-out'));
        }, VERZOEK_TIMEOUT_MS);
        wachtend.set(id, { klaar: klaar, mis: mis, timer: timer });
        var bericht = { werkplek: WERKPLEK, id: id, soort: soort };
        for (var k in velden) if (Object.prototype.hasOwnProperty.call(velden, k) && velden[k] !== undefined) bericht[k] = velden[k];
        stuur(bericht, overdracht);
      });
    });
  }

  // De handdruk.
  var halloTimer = setInterval(function () {
    var id = volgendId++;
    halloIds.add(id);
    stuur({ werkplek: WERKPLEK, id: id, soort: 'hallo', soorten: APP_SOORTEN.slice() });
  }, HALLO_INTERVAL_MS);
  var opgevenTimer = setTimeout(function () {
    if (toestand !== 'wacht') return;
    toestand = 'opgegeven';
    clearInterval(halloTimer);
    console.warn('[brug] de gastpagina antwoordt niet; openen en opslaan via de site werken niet');
    verbindingMis(hostFout('The page around Open Calc Studio does not respond', 'geen-contact'));
  }, HALLO_OPGEVEN_MS);

  function opAntwoord(d) {
    if (halloIds.has(d.antwoord)) {
      halloIds.clear();
      if (toestand === 'wacht') {
        toestand = 'verbonden';
        verbondenNa = Math.round(performance.now() - start);
        clearInterval(halloTimer);
        clearTimeout(opgevenTimer);
        verbindingKlaar();
      }
      return;
    }
    var w = wachtend.get(d.antwoord);
    if (!w) return;
    wachtend.delete(d.antwoord);
    clearTimeout(w.timer);
    if (d.ok === true) w.klaar(d.waarde);
    else w.mis(hostFout(typeof d.fout === 'string' ? d.fout : 'The site refused the request', typeof d.code === 'string' ? d.code : null));
  }

  // De assistent van de site vraagt de app (app.*).
  function voerAppVerzoekUit(d) {
    var doel = window.__OPDS_APP__;
    if (!doel) throw hostFout('The application has no tools for the assistant (yet)', 'geen_app');
    switch (d.soort) {
      case 'app.tools': return doel.tools();
      case 'app.definities': return doel.definitions();
      case 'app.run':
        if (typeof d.naam !== 'string' || !d.naam) throw hostFout('app.run needs a tool name (naam)', 'ongeldige_argumenten');
        return doel.run(d.naam, d.argumenten && typeof d.argumenten === 'object' ? d.argumenten : {});
      default: throw hostFout('Unknown request: ' + d.soort, 'onbekende_soort');
    }
  }

  window.addEventListener('message', function (e) {
    if (e.source !== window.parent || e.origin !== ouder) return;
    var d = e.data;
    if (!d || typeof d !== 'object' || d.werkplek !== WERKPLEK) return;
    if (typeof d.antwoord === 'number') { opAntwoord(d); return; }
    if (typeof d.soort !== 'string' || APP_SOORTEN.indexOf(d.soort) < 0) return;
    Promise.resolve().then(function () { return voerAppVerzoekUit(d); }).then(function (waarde) {
      stuur({ werkplek: WERKPLEK, antwoord: d.id, ok: true, waarde: waarde === undefined ? null : waarde });
    }, function (f) {
      var bericht = { werkplek: WERKPLEK, antwoord: d.id, ok: false, fout: f && f.message ? f.message : String(f) };
      var code = f && typeof f.code === 'string' ? f.code : (/^([a-z_]+):/.exec(bericht.fout) || [])[1];
      if (code) bericht.code = code;
      stuur(bericht);
    });
  });

  var tekst = function (v) { return v === undefined || v === null ? undefined : String(v); };

  // Het contract.
  var host = {
    open: function (id, version) {
      var velden = { bestand: String(id) };
      if (version !== undefined && version !== null) velden.versie = typeof version === 'string' && /^\s*\d+\s*$/.test(version) ? Number(version) : version;
      return verzoek('open', velden).then(function (w) {
        var bytes = w && w.bytes instanceof ArrayBuffer ? new Uint8Array(w.bytes) : (w && ArrayBuffer.isView(w.bytes) ? new Uint8Array(w.bytes.buffer, w.bytes.byteOffset, w.bytes.byteLength) : null);
        if (!bytes) throw hostFout('The site returned no bytes for the file', 'antwoord');
        var ref = { id: tekst(w.bestand) || String(id), name: tekst(w.naam) || 'begroting.ifcCalc', version: w.versie === undefined ? null : w.versie,
          readOnly: w.alleen_lezen === true || (version !== undefined && version !== null), bytes: bytes };
        verzoek('geopend', { bestand: ref.id }).catch(function () {});
        return ref;
      });
    },
    save: function (bytes, options) {
      var o = options || {};
      var buffer = eigenBuffer(bytes);
      if (o.id !== undefined && o.id !== null && o.id !== '') {
        var velden = { bestand: String(o.id), bytes: buffer };
        if (o.expectedVersion !== undefined && o.expectedVersion !== null) velden.verwachte_versie = o.expectedVersion;
        return verzoek('opslaan', velden, [buffer]).then(function (w) {
          return { id: tekst(w.bestand) || String(o.id), name: tekst(w.naam) || tekst(o.name) || '', version: w.versie === undefined ? null : w.versie };
        });
      }
      if (o.name) {
        return verzoek('opslaan_als', { naam: String(o.name), bytes: buffer }, [buffer]).then(function (w) {
          if (!tekst(w.bestand)) throw hostFout('The site returned no id for the new file', 'antwoord');
          return { id: String(w.bestand), name: tekst(w.naam) || String(o.name), version: w.versie === undefined ? null : w.versie };
        });
      }
      return Promise.reject(hostFout('save needs an id or a name', 'ongeldige_argumenten'));
    },
    list: function () {
      return verzoek('lijst', {}).then(function (lijst) {
        return (Array.isArray(lijst) ? lijst : []).filter(function (d) { return d && d.id !== undefined && d.soort !== 'map'; })
          .map(function (d) { return { id: String(d.id), name: tekst(d.name !== undefined ? d.name : d.naam) || '', modified: tekst(d.modified) || '' }; });
      });
    },
    versions: function (id) {
      return verzoek('versies', { bestand: String(id) }).then(function (lijst) {
        return (Array.isArray(lijst) ? lijst : []).filter(function (v) { return v && typeof v === 'object'; });
      });
    },
    settings: {
      get: function (key) { return verzoek('instelling.lees', { sleutel: String(key) }); },
      set: function (key, value) { return verzoek('instelling.zet', { sleutel: String(key), waarde: value === undefined ? null : value }); },
      delete: function (key) { return verzoek('instelling.wis', { sleutel: String(key) }); },
    },
  };
  if (bestand) host.initialFileId = bestand;
  if (taal && /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(taal)) host.taal = taal;
  if (thema === 'light' || thema === 'dark') host.thema = thema;

  window.openaecHost = host;
  window.__WERKPLEK_BRUG__ = { ouder: ouder, toestand: function () { return toestand; }, verbondenNa: function () { return verbondenNa; } };
  window.dispatchEvent(new Event('openaec-host-ready'));
})();
