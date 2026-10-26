# Onderzoek calculatiepakketten en backlog

Onderzoeksdatum: 28 september 2026. Doel: bruikbare uitbreidingen voor Open Calc Studio, inclusief de herbruikbare library.

**Publicatiestatus: zeven conceptissues klaar; nog niet op GitHub aangemaakt wegens ontbrekende aanmelding.** Zie [issues.json](issues.json) voor de afzonderlijke statussen en eventuele publicatie-URL's.

**Actualisatie 5 oktober 2026:** het eerste concept is aangepast aan de inmiddels lokaal gebouwde PDF-workspace. De zeven voorstellen zijn opnieuw tegen de publieke GitHub-issuelijst gecontroleerd; er is nog geen nieuwe issue gepubliceerd. De browser is nog uitgelogd, de GitHub-CLI ontbreekt en er is geen GitHub-token in deze omgeving. De overige zes voorstellen blijven een backlog, geen toezegging dat de functies al gebouwd zijn.

## Aanpak en beperkingen

Vergelijking op basis van officiële productpagina's, leveranciersdocumentatie en de GEstimator-repository. Commerciële pakketten zijn niet geïnstalleerd of functioneel getest. Een leveranciersclaim bewijst de beschreven workflow, niet de kwaliteit of beschikbaarheid in iedere editie. Dit is een gerichte vergelijking van zeven pakketten, geen volledige marktinventarisatie.

Voor Open Calc Studio zijn README, datamodel, state, viewers, import/export, rapportage en library bekeken. Basiscommit: `b47042704efa388d95eb59ce77d23aeb5ee0e44c`, inclusief lokaal onvastgelegd werk. Functiegaten zijn conclusies uit die code-inspectie; de runtime is tijdens dit onderzoek niet opnieuw getest. Prioriteiten zijn een productvoorstel, geen bestaande GitHub-labels.

## Vergelijking

| Pakket | Geverifieerde documentatie | Relevantie voor Open Calc Studio |
|---|---|---|
| [IBIS Calculeren](https://ibiscalculeren.ibis.nl/bouw/help/moduleoffertevergelijksql.html) | Offertespiegels, onderlinge prijsvergelijking, terugschrijven naar begroting. Volgens deze documentatie afhankelijk van Expert/SQL/Projecten. | Inkomende offertes vergelijken naast de bestaande uitgaande offerte. Issue 03. |
| [2Jours](https://www.2jours.nl/prijzen-zzp/) | Prijsactualisatie, eigen prijslijsten en taken overnemen in planning. [Projectbewaking](https://www.2jours.nl/onze-mogelijkheden/) omvat uren/materialen boeken. | Prijzen gecontroleerd verversen, werkelijke kosten importeren, planning koppelen. Issues 02, 05, 06. |
| [KRAAN / ECI](https://www.ecisolutions.com/nl/producten/rhceu-kraan/) | De huidige site beschrijft samenhang tussen calculatie, urenregistratie, projectbewaking en inkoop. | Pleit voor bruikbare overdracht naar uitvoeringsprocessen, zonder direct een volledig ERP te bouwen. Issue 05. |
| [RIB CostX](https://www.rib-software.com/en/rib-costx) | 2D/3D-uittrekken, gekoppelde begrotingen, revisies en embodied-carbonberekening. | Meetgegevens bewaren, wijzigingen beoordelen en optioneel CO2 vergelijken. Issues 01, 04, 07. |
| [RIB Presto](https://www.rib-software.com/es/rib-presto) | Verbindt begroten met planning, uitvoering, voortgang en werkelijke kosten. | Een aparte werkelijke-kostenregistratie naast de begroting. Issue 05. |
| [Elecosoft Bidcon](https://elecosoft.com/us/products/bidcon/) | Eigen kostenbibliotheken, leveranciersprijzen en overdracht van een begroting naar Asta Powerproject. | Bibliotheekversies en een open planningexport. Issues 02, 06. |
| [GEstimator](https://github.com/manuvarkey/GEstimator/blob/master/README.md) | Open-source begroten met prijsanalyses, gekoppelde meetdetails en export naar Excel. | Controleerbaarheid van hoeveelheden en een bewaard meetdossier. Issue 01. |

Bronnotitie KRAAN: het zoekresultaat voor de oude pagina `kraan.com/2d-meetstaten/` beschrijft meetstaten en revisie-overlays, maar de URL verwijst bij openen door naar ECI. Die oude tekst is daarom niet gebruikt als doorslaggevend bewijs voor actuele revisiefuncties. Het revisie-issue steunt op RIB-documentatie.

## Wat al bestaat

Open Calc Studio heeft al hiërarchische begrotingen, middelen, normen, staart, tariefgroepen, varianten, snapshots, veldhistorie, rapporten, uitgaande offertes, spreadsheets, PDF-metingen, IFC-hoeveelheidskoppelingen en diverse uitwisselformaten. De library heeft afzonderlijke core/importer/isolated-entries. Deze functies zijn geen nieuwe featureverzoeken.

Grenzen van de basis zoals bekeken op 28 september; de PDF-status is hieronder geactualiseerd:

- De PDF-workspace bewaart inmiddels ingebedde tekeningen, meetgeometrie en kalibratie in `schedule.pdfWorkspace`. De resterende kloof is een expliciete revisie-identiteit en een herstel-/herkoppelworkflow voor ontbrekende bronnen. Bij een verdwenen bron blijft de laatst bekende hoeveelheid staan en verschijnt een waarschuwing in het grid; ook een lege som wordt niet stilzwijgend nul.
- `src/state/slices/resourceLibrarySlice.ts` laadt middelen; `ResourcePicker.tsx` kopieert prijzen. Een versiegestuurde, selectieve actualisatie ontbreekt in de bekeken workflow.
- `offerteSlice.ts` en `OfferteView.tsx` ondersteunen de offerte aan de klant; een offertespiegel voor ontvangen aanbiedingen is een andere functie.
- `versionSlice.ts` vergelijkt begrotingssnapshots. Er is geen vergelijkbare tekenrevisieworkflow aangetroffen.
- De rapportnaam `nacalculatie` bestaat, maar er is in het bekeken model geen afzonderlijk transactieregister met werkelijk gemaakte kosten.

## Voorgestelde issues en volgorde

| Prioriteit | Conceptissue | Eerste afbakening |
|---|---|---|
| P1 | [01 — PDF-meetdossier afronden](issues/01-persist-takeoff.md) | Revisie-identiteit, bronherstel, draagbare bijlagen en aanvullende round-trips. Basisopslag en waarschuwing bestaan lokaal. |
| P1 | [02 — Prijsbibliotheken actualiseren](issues/02-catalogue-updates.md) | Eigen CSV/JSON-bronnen, versies, wijzigingspreview en behoud van overrides. |
| P2 | [03 — Offertespiegel](issues/03-bid-comparison.md) | Handmatig/CSV, scopeverschillen, vergelijking en gecontroleerd terugschrijven. |
| P2 | [04 — Tekenrevisies vergelijken](issues/04-drawing-revisions.md) | PDF-overlay en menselijke beoordeling; volgt op 01. |
| P2 | [05 — Begroot versus werkelijk](issues/05-actual-costs.md) | Idempotente CSV-import, kosten-/urenmapping en afwijkingsrapport. |
| P3 | [06 — Planningexport](issues/06-planning-export.md) | Open CSV/JSON-overdracht van werkpakketten en arbeidsuren. |
| P3 | [07 — CO2 naast kosten](issues/07-embodied-carbon.md) | Optionele materiaalberekening, A1–A3, eigen factoren en expliciete dekking. |

P1 = eerst versterken, P2 = praktische uitbreiding, P3 = daarna of verkennend. De uitvoerbare criteria staan in de Engelstalige issues, passend bij de internationale repository.

## Bewust niet als nieuw issue opgenomen

Volledige realtime samenwerking, een eigen ERP, payroll en een eigen planningengine zijn omvangrijke aparte productbeslissingen. Bestaande varianten, snapshots en algemene audit-historie opnieuw aanvragen zou dubbel werk opleveren. Een complete gecertificeerde LCA/MPG-oplossing valt buiten het beperkte CO2-voorstel.

## Bestaande GitHub-issues

Alle zeven aangetroffen open/gesloten issues zijn op 5 oktober opnieuw bekeken via de publieke GitHub API. Zie [de vastgelegde lijst](existing-issues.json). Open staan [#2 — macOS opstarten](https://github.com/OpenAEC-Foundation/open-calc-studio/issues/2) en [#12 — gebruikershandleiding](https://github.com/OpenAEC-Foundation/open-calc-studio/issues/12). Geen van de zeven bijgewerkte voorstellen heeft daar een inhoudelijke dubbeling. Deze bestaande issues worden niet gesloten of gewijzigd door dit onderzoek.

## Publiceren zodra GitHub beschikbaar is

Op 5 oktober is de browser nog uitgelogd en `gh` niet geïnstalleerd. Browseraanmelding en CLI-aanmelding zijn onafhankelijk: voor het script hieronder is een aangemelde `gh` vereist.

`python3 publish_issues.py --gh /pad/naar/gh --publish`

Zonder `--publish` toont het script alleen de concepten. Het gebruikt gestructureerde argumenten en body-bestanden, controleert bestaande issues op titel of onderzoeksmarker en slaat iedere bevestigde URL op in `issues.json`. Het maakt geen labels, projecten of milestones aan. De opdracht van de gebruiker autoriseert het plaatsen; alleen authenticatie ontbreekt.
