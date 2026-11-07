# Werkplek-sandbox: de platformbouw in een nagebootste SuperCloud

Lokale controle voor het laatste vinkje van issue #61: de platformbouw start zonder fouten in een
`sandbox="allow-scripts allow-downloads allow-modals"`-frame (zoals de echte werkplek), en Openen, Opslaan en de assistent werken met een nep-`window.openaecHost`.

## Zelf bekijken

```sh
npm run build:platform                          # maakt dist/ (een paar minuten)
node verification/werkplek-sandbox/server.mjs   # Ctrl+C stopt
```

Open **http://localhost:3672/werkplek/calc** in Chrome of Edge. Links draait Open Calc Studio in het afgeschermde frame,
rechts de "host":

- **Bestanden bij de host**: wat de nep-SuperCloud in het geheugen heeft, met het aantal versies. "start hiermee" herlaadt
  de pagina met dat bestand als `initialFileId`.
- **Assistent**: knoppen die via de brug `window.__OPDS_APP__` in het frame aanroepen (`calc_get_budget_summary`,
  `calc_new_budget`, …), of een vrije tool met JSON-argumenten. In de console van de bovenste pagina:
  `await werkplek.run('calc_get_items', {limit: 3})`, `werkplek.tools()`, `werkplek.bestanden()`.
- **Berichten over de brug**: elk verzoek van de app (open, opslaan, lijst, versies, instellingen) en elke tool-aanroep.

Om te proberen, in de app:

1. Voorbeeldbegroting staat open (DOC-1). Wijzig een omschrijving, druk **Ctrl+S**: rechts krijgt DOC-1 een versie erbij.
2. **Ctrl+O**: de lijst van de host; kies "Sample estimate", of kies een bestand en daaronder een oudere versie
   (alleen-lezen: Opslaan wordt geweigerd).
3. **Ctrl+Shift+S** (Opslaan als): een nieuw bestand `… (2).ifcCalc` bij de host.
4. Vink "Piet slaat op vóór de volgende opslag" aan en sla op: de host bewaart een kopie
   `Voorbeeldbegroting (conflict Anna 2026-11-07 1405).ifcCalc`, de app gaat daarheen en meldt de naam. Hetzelfde met
   "Piet vergrendelt het bestand" (een kopie, al klopt de versie). Met "volgende opslag weigeren met" geeft de host een
   foutcode van storage (bv. `quotum_ruimte_vol`): geen versie, geen kopie, de app meldt het en het tabblad blijft gewijzigd.
5. De knop **Tweede scherm** in de werkruimtebalk hoort er niet te staan. Ter vergelijking zonder werkplek:
   http://127.0.0.1:3671/los/ (zelfde bundel, geen sandbox, geen host).

Poorten aanpassen: `WERKPLEK_POORT_APP` (3671) en `WERKPLEK_POORT_GAST` (3672). Een andere bundelmap: als eerste argument.

## Automatisch

```sh
npm run verify:werkplek     # of: node verification/werkplek-sandbox/controle.mjs [--dist <map>] [--headed]
```

Start de server, opent de gastpagina headless in Chrome (Playwright; zonder eigen Playwright-browser via het kanaal
`chrome` of `msedge`), loopt alle stappen hierboven door en stopt alles weer. Het telt elke consolefout, paginafout en
CSP-overtreding (ook een 404). Verslag en schermafdrukken: `verification/werkplek-sandbox/uitvoer/` (niet in git).
Exitcode 0 = alles geslaagd.

## Hoe dicht dit bij de echte werkplek zit

Nagebootst zoals de proef van Open PDF Studio (`scripts/werkplek-proef.mjs`, `scripts/gehost-html.mjs`):

- Twee oorsprongen: de bundel op `http://127.0.0.1:3671/werkplek/app/calc/`, de gastpagina op `http://localhost:3672`.
- Het frame: `sandbox="allow-scripts allow-downloads allow-modals" credentialless`, hash
  `#ouder=<gastpagina>&app=calc&bestand=<id>&taal=nl&thema=light`; dus origin `null`, geen opslag, geen cookies.
- Op elk bestand van de bundel de CSP van de host (`werkplekCsp`): `sandbox …; default-src 'none'; script-src <bundel>
  <brug> 'wasm-unsafe-eval'` (geen `'unsafe-inline'` voor scripts), `connect-src` alleen de bundel, `frame-ancestors` de
  gastpagina; plus `Access-Control-Allow-Origin: *`, CORP `cross-origin`, `nosniff`, `Referrer-Policy: no-referrer`.
- Het berichtprotocol `{werkplek: 1, id, soort, …}` / `{werkplek: 1, antwoord, ok, waarde | fout, code}`, handdruk
  `hallo` elke 250 ms, bytes als overgedragen `ArrayBuffer`, de gastpagina accepteert alleen `e.source === frame` met
  origin `"null"`; de brug alleen `window.parent` met de origin uit `#ouder` (en `ancestorOrigins`).

### Overgenomen uit de echte opslag (openaec-storage)

De opslag achter de werkplek is openbaar: [OpenAEC-Foundation/openaec-storage](https://github.com/OpenAEC-Foundation/openaec-storage)
(main, 7 november 2026). `gast.js` doet het zo:

- **Conflictregel** (`openaec_storage/api.py`, `_registreer`): een nieuwe versie alleen als `basis_versie` (bij ons
  `verwachte_versie`) gelijk is aan de huidige versie **en** geen ander het bestand vergrendelde (`_actief_slot`).
  Anders, ook zonder `basis_versie`, een conflictkopie: een nieuw bestand naast het origineel, met versie 1.
- **Naam van de kopie** (`_conflictnaam`): `<stam> (conflict <voornaam> <YYYY-MM-DD HHMM>)<ext>`, bij een bestaande
  naam met een teller vanaf 2: `… (conflict Anna 2026-11-07 1405 2).ifcCalc`. De voornaam is `User.first_name`; hier
  is de gebruiker Anna en de ander Piet (zoals in issue #10 en #11 van openaec-storage).
- **Versienummers** (`Bestandsversie.volgnummer`, `Opslagbestand.huidige_versie`): gehele getallen vanaf 1, +1 per
  opslag; een kopie en een nieuw bestand beginnen op 1.
- **Id's** (`Opslagbestand`, `autoname: hash`): tien hextekens voor nieuwe bestanden en kopieën (de begindocumenten
  houden `DOC-1` enz.).
- **Versielijst** (`versies`): nieuwste eerst (`order_by="volgnummer desc"`).
- **Lijst** (`bladeren`): op naam gesorteerd, inclusief conflictkopieën.
- **Weigeren met een foutcode** (`rechten.weiger`, README "Foutcodes"): eerst de rechten, het archief en het quotum
  (`upload_start`/`upload_klaar`), dan pas de conflictregel. De meldingen zijn die van storage:
  `ruimte_gearchiveerd` (DOC-RO "Archief 2025"), `quotum_ruimte_vol`, `alleen_lezen_deling`, `deling_ingetrokken`,
  `map_alleen_lezen`; zonder reden `Geen toegang tot deze plek` zonder code.
- **Namen** (`namen.py`, `_controleer_naam`): `Ongeldige naam: <reden>` met `ongeldige_naam`; een bezette naam bij
  Opslaan als wordt `naam (2).ifcCalc` (`_vrije_naam`); een andere soort `extensie_niet_toegestaan` (`mapsjablonen.py`).

Uit de werkplek zelf (niet openbaar; uit de proef van Open PDF Studio, `scripts/werkplek-proef.mjs` en
`js/core/host-brug.js`, en issue #2 en #11 van openaec-storage):

- `open`, `opslaan` en `versies` alleen voor het bestand van de pagina, een bestand uit `lijst` of wat opslaan maakte
  (anders `Dit bestand mag deze pagina niet openen.`, zonder code).
- `open` met `versie`: alleen-lezen; een ongeldig nummer `versie_ongeldig`; daarna weigert `opslaan` met
  `versie_alleen_lezen` tot een `open` zonder versie.
- `open` geeft `alleen_lezen: true` als een ander het bestand vergrendelde; `opslaan` geeft `vergrendeld: true`.
- `versies` als `{version, modified, author}` en `lijst` als `{id, name, modified}` (storage zelf: `volgnummer`,
  `creation`, `maker` en `name`, `naam`, `modified`).

### Nog aangenomen (niet getoetst tegen de echte SuperCloud)

- **De brug** (`brug.js`) is van ons. Dat de host een script uit `/werkplek/app/brug/` laadt staat in de CSP van de
  host; hoe het in het frame komt, weten we niet zeker. Hier voegt de server `<script src="/werkplek/app/brug/…">` als
  eerste regel in `<head>` van index.html in. Gaat het in het echt anders (bijvoorbeeld pas na de start), dan vangt de
  app dat op met `openaec-host-ready` en de controle elke 250 ms, maar dat pad test deze proef niet.
- **Instellingen** (`settings.get/set/delete`) lopen hier als `instelling.lees/zet/wis`: eigen namen, de echte
  berichtsoorten daarvoor zijn niet bekend.
- **Conflict**: storage maakt altijd een kopie en weigert nooit om een verouderde versie. Dat de werkplek de
  foutcode van storage als `code` doorgeeft, de volgorde van `versies` niet omdraait, `melding` bij een conflict
  meestuurt en tijden als `YYYY-MM-DD HH:MM:SS` geeft (Frappe heeft microseconden), is aangenomen. `VERSION_CONFLICT`
  uit `docs/supercloud.md` komt in storage niet voor; dat pad zit hier niet in.
- **Opslaan als**: `opslaan_als { naam, bytes }` zonder mappen; de echte host kent mogelijk mappen en meer foutcodes.
- Geen `ai.vraag`, geen `melding` van de app naar de host, geen login, geen mappen of ruimtes. Rechten, sloten en
  quota alleen als schakelaar op de gastpagina, niet echt per gebruiker.
- Alleen Chromium (Chrome/Edge); `credentialless` en `ancestorOrigins` bestaan niet in Firefox.
