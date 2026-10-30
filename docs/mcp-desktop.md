# Desktopfuncties via één MCP-server

De bestaande Open Calc Studio MCP-server bevat zowel bestandsbewerkingen zonder venster als bediening van de draaiende desktopapp. De nieuwe `app_*`-tools gebruiken de actuele desktopbegroting. De 211 JSON-aanroepbare store-acties worden uit de TypeScript-interfaces gegenereerd; daarnaast zijn er opdrachten voor bestanden, PDF-metingen, IFC-Lite en controlecentrum. Alleen drie interne uitbreidingshooks die JavaScript-functies als argument vereisen, zijn geen MCP-acties. Die hooks zijn geen gebruikerscommando's.

## Controlecentrum

`review.list` geeft meldingen, categorietellers en aantallen regels voor de
actieve variant, inclusief ingeklapte regels. Optioneel: `category` met
`all`, `price`, `source` of `unit`. De tellers beschrijven de hele controle;
alleen `issues` wordt op de gekozen categorie gefilterd. Geen bronbytes.

`review.open` opent het overzicht en kan dezelfde `category` instellen.
`review.openItem` met `itemId` uit de meldingen selecteert de juiste regel
en klapt ouders uit. Een inmiddels opgeloste of niet-actieve regel wordt
geweigerd. Bedragen, wijzigingsstatus en undo blijven behouden.
`setReviewFilter` en `setReviewIssue` zijn ook store-acties. De pure SDK
exporteert `reviewBudget` voor dezelfde controles zonder desktopvenster.

## Verbinden

Start de nieuwe desktopbuild en gebruik Node.js om de meegeleverde `ocs-mcp.mjs` te starten in je MCP-client. De app schrijft een voorbeeldconfiguratie naar `~/.claude/open-calc-studio-mcp.json`. Het bestand verwijst naar een blijvende kopie van de server. Neem die configuratie op in je MCP-client als die het bestand niet automatisch ontdekt.

De app-opdrachten gebruiken standaard `http://127.0.0.1:9742/api/v1/command`. Met `OCS_DESKTOP_API_URL` kan de MCP-server een andere lokale instantie kiezen; de desktop gebruikt dan `OCS_API_PORT`. Wanneer de desktop met `OCS_API_TOKEN` gestart is, moet dezelfde waarde in de MCP-omgeving staan. Een opdracht geeft pas succes terug nadat de webview haar heeft uitgevoerd. Een gesloten app, ongeldige invoer of mislukte uitvoering geeft een fout.

## Werkwijze

1. Vraag `app_list_actions` op. Gebruik `group` om bijvoorbeeld `Offerte`, `SubSheet`, `Version`, `Ui`, `CostItems` of `Accounts` te bekijken. Gebruik `action` voor de volledige invoerspecificatie van één functie.
2. Lees `app_get_state` om de echte document-, regel- en selectie-ID's te krijgen. Deze status laat accountgeheimen en de ingebedde PDF-bytes weg.
3. Voer `app_action` uit met `action` en een object met **benoemde parameters**. Bijvoorbeeld: `{"action":"setActiveContentTab","params":{"tab":"viewer3d"}}`.
4. Controleer de terugmelding en sla het project op met `app_save_budget` naar een nieuw native bestand of met `file.export` naar een gekozen pad.

Voorbeeld spreadsheet: `addSubSheet` met `name` geeft een `result` met de echte blad-ID terug. Gebruik die ID in `setSubSheetCell` met `sheetId`, `cellRef` en `value`.

De oude tools zoals `open_budget` en `add_item` werken op het afzonderlijke document in het MCP-proces. Gebruik voor de live app consequent de `app_*`-tools. De automatisch geschreven configuratie schakelt de oudere ongecontroleerde achtergrondbrug uit.

## Bereik

| Onderdeel | MCP-bediening |
| --- | --- |
| Begroting, structuur, regels, normen, tarieven en staart | `app_action` met de acties uit `CostItems` en `CostSchedule` |
| Rijen selecteren, kopiëren, knippen, plakken, undo/redo | `Selection`, `Clipboard`, `History` |
| Varianten, uren verdelen, prijsaanpassingen, wijzigingen bijhouden | `CostSchedule`, `CostItems` |
| Spreadsheets en opmaak | `SubSheet`, `SpreadsheetHistory` |
| Offertes, secties, lagen, afbeeldingen, termijnen en garanties | `Offerte` |
| Versies en vergelijken | `Version` |
| Bibliotheken en codes | `ResourceLibrary`, `CodeLibrary` |
| Documenten, thema's, tabbladen, zoom, kolommen en rapportinstellingen | `Document`, `Ui`, `View`, `Settings` |
| Account- en cloudfuncties | `Accounts`; aanmelden loopt via de normale appaanmelding |
| Openen, importeren, opslaan en exporteren | `app_open_budget`, `app_save_budget`, `file.import`, `file.export`, `export.pdf`, `export.ifc` |
| PDF toevoegen, schaal, lengte/oppervlakte, verwijderen, import en koppelen | `app_open_pdf`, `pdf.*` |
| IFC laden, zoeken, selecteren, isoleren, camera passend maken, hoeveelheden koppelen | `app_open_ifc`, `ifc.*` |

## PDF-metingen

Gebruik `app_open_pdf` met een absoluut bestandspad. Het resultaat bevat `sourceId`. Kalibreer met `pdf.calibrate`: `sourceId`, `page` (vanaf 1), twee `points` op PDF-viewport-schaal 1 en `distanceMeters`. Maak daarna met `pdf.measure` een `length` of `area`. `pdf.link` koppelt de teruggegeven `measurementId` aan een bestaande `itemId`. Herkalibreren werkt ook de gekoppelde begrotingshoeveelheid bij. `pdf.importMeasurements` neemt de export uit Open PDF Studio over.

## IFC en 3D-splitview

`app_open_ifc` opent het model in **3D & Begroting**. `ifc.listElements` geeft de element-ID's en benoemde IFC-quantitysets terug. `ifc.select` accepteert `elementIds`. Gebruik `ifc.takeoff` met `quantityKey` en optioneel `itemId`: zonder post-ID krijg je alleen de som; met post-ID wordt de hoeveelheid gekoppeld aan die begrotingsregel. `__count__` telt unieke elementen. Selectie van een hoeveelheid die niet op alle elementen voorkomt geeft een fout; er wordt niet gedeeltelijk overgenomen.

Zie [3D & Begroting](ifc-lite-splitview.md) voor de bediening met de muis en het bewaren van bronnen.

## Wat dit niet toevoegt

De MCP-server maakt bestaande appfuncties bereikbaar. Niet-geïmplementeerde bestandsformaten worden hierdoor niet ondersteund: GAEB-export, SIA 451/CRBX, PriMus DCF/XPWE en OST/OSP ontbreken nog. WpCalc-export houdt zijn Windows/Access-driververeiste. IFC-hoeveelheden komen uit opgegeven quantitysets; ontbrekende hoeveelheden worden niet uit een omhullende doos geschat.

## Ontwikkeling en controle

Na wijzigingen aan store-interfaces: `node scripts/generate-mcp-actions.mjs`. De test `desktopCommand.test.ts` controleert dat elke store-functie in de catalogus of de expliciete lijst met callbackhooks staat. `ifcLiteTakeoff.test.ts` gebruikt een echt IFC-bestand om eenheden en aggregatie te controleren. `mcp-server/scripts/check-desktop.mjs` controleert de stdio-MCP-keten tegen een **aparte** desktop op poort 19742, inclusief IFC-geometrie, PDF-metingen, opslaan en foutmeldingen.

## Dekkingscontrole — 30 september 2026

202 JSON-aanroepbare store-methoden zijn opgenomen in de catalogus. De dekkingstest controleert de aanwezigheid van die methoden, niet alle UI-handlers of alle uitvoeringspaden. De gerichte MCP/PDF/IFC-tests zijn opnieuw uitgevoerd: 12 geslaagd. De eerdere desktopintegratietest controleerde daadwerkelijke IFC-selectie, PDF-metingen, gekoppelde hoeveelheden, exports en foutafhandeling.

Volledige functionele gelijkheid met de interface is nog niet aangetoond. Bij broncontrole zijn onder meer deze verschillen gevonden:

- GAEB X84-prijzen toepassen bestaat in de interface en als `apply_gaeb_x84` op het afzonderlijke serverdocument, maar heeft nog geen directe live `app_*`-opdracht.
- CSV/XLSX-import gebruikt via MCP automatische kolomdetectie. De handmatige kolomkoppeling uit het importdialoog is nog niet als benoemde live opdracht beschikbaar.
- Linttabblad, backstage-paneel, IFC-zoektekst en de gekozen hoeveelheid in de keuzelijst zijn lokale componentstatus. De onderliggende IFC-selectie en hoeveelhedenovername zijn wel aanroepbaar.
- De cloudaanmelding vereist gebruikersinteractie. De beschikbaarheid in de catalogus is geen bewijs dat alle account-/cloudpaden zijn getest.

Een visuele UI-test is in deze sessie niet uitgevoerd: native desktopbediening was niet beschikbaar en de opgeslagen browsertoestemming blokkeerde het openen van de lokale webinterface. API- en unit-tests vervangen die visuele controle niet.

## Werkplekken, brongegevens en financiële voorstellen (2026.44.1)

- `workspace.layouts` geeft de ingebouwde en eigen werkplekken. Gebruik
  `applyWorkspaceLayout`, `saveWorkspaceLayout` en `deleteWorkspaceLayout`
  met de parameters uit `app_list_actions` om dezelfde indelingen te beheren.
- `workspace.openSecondScreen` opent een alleen-lezen tweede venster voor PDF
  en hoeveelheidherkomst. De begroting wordt uitsluitend in het hoofdvenster bewerkt.
- `quantity.origin { itemId }` leest bronidentiteit, pagina/objecten, formule,
  koppelwaarde en waarschuwingen zonder bronbytes. `quantity.openSource`
  navigeert met `itemId` en een optionele nulgebaseerde `sourceIndex`.
- `assistant.preview { actions }` berekent een voorstel zonder begrotingsmutatie
  en geeft een `id`, gewijzigde regels, aannames en financiële totalen terug.
- `assistant.apply { proposalId }` keurt dat voorbereide voorstel expliciet goed.
  De volledige begrotingswijziging krijgt één undo-stap. Een inmiddels gewijzigde
  begroting of een ander actief document wordt geweigerd.
- `assistant.discard { proposalId }` verwerpt het voorstel.
- `assistant.undo { proposalId }` draait de hele toegepaste wijziging terug,
  mits er geen latere bewerkingen zijn en het oorspronkelijke document actief is.

Voorstel-ID's zijn sessiegebonden en eenmalig voor toepassing. De server bewaart
maximaal 50 voorbereide voorstellen; bereid verlopen voorstellen opnieuw voor.
Deze functies gebruiken het actuele desktopdocument. De aparte headless rekenservice
blijft een onafhankelijke rekeninterface en opent geen vensters.

### IFC-resultaten in één keer selecteren

`ifc.selectFiltered {search?: string}` vervangt de 3D-selectie door alle
naam/type-overeenkomsten, onafhankelijk van de zichtbare pagina van 100
elementen. Een lege zoektekst selecteert het hele geopende model.
`ifc.select {elementIds: []}` wist de selectie. Met `ifc.getSelection`
controleer je het resultaat; `ifc.listElements {search}` leest dezelfde
zoekresultaten. Een geladen 3D-model is vereist voor selectie.
