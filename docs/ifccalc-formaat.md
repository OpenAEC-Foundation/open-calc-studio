# Het .ifcCalc-bestandsformaat

Dit document is de referentie voor het Open Calc Studio-werkbestand
(`.ifcCalc`, ook leesbaar als `.ocs`/`.json`/`.ifcx` met dezelfde inhoud):
wat erin zit, hoe versies werken en wat de compatibiliteitsgaranties zijn.

## Wat is een .ifcCalc-bestand?

Een `.ifcCalc`-bestand is een **JSON-document** (UTF-8) met het complete
project: de begroting zelf plus alles eromheen. Top-level structuur:

| Veld | Type | Sinds | Inhoud |
|---|---|---|---|
| `version` | string | altijd | Formaatversie `major.minor.patch` (zie hieronder) |
| `schedule` | object | 1.0 | Projectgegevens: naam, projectnummer, opdrachtgever, status, tarieven (A/B/C), staart-instellingen, `projectInfo` (kengetallen zoals BVO), `branches` |
| `items` | array | 1.0 | Alle begrotingsregels (zie *CostItem*) in hiërarchische volgorde |
| `resourceLibrary` | array | 2.0 | Middelenbibliotheek van het project |
| `companyInfo` | object | 1.0 | Bedrijfsgegevens (naam, logo, adres) voor rapportages |
| `spreadsheets` | object | 2.1 | Spreadsheet-bladen `{ sheets, activeSheetId }` (verving `subSheets[]` uit 2.0) |
| `offerte` | object? | 2.0 | Offertedocument (secties, teksten, afbeeldingen) |
| `snapshots` | array? | 2.1 | Projectsnapshots (versies binnen het bestand) |
| `createdAt` / `modifiedAt` | string | 1.0 | ISO-tijdstempels |

### CostItem (begrotingsregel)

Elke regel heeft `id`, `parentId` (hiërarchie), `sortOrder`, `depth`,
`rowType`, omschrijving/code/eenheid, hoeveelheden en prijzen. Kernvelden:

- `rowType`: `chapter` · `begrotingspost` · `bewakingspost` · `regel` ·
  `tekstregel` · `witregel` · `staart_*` (staartkosten als rijen)
- Normcalculatie (op `regel`): `quantity` (aantal), `normQuantity` (norm),
  `normFactor`/`normDivisor` (capaciteit), `normUnitPrice` (prijs/middel),
  `laborPrice` (loon per eenheid), `tariefGroep` (A/B/C)
- `resourceType`: `arbeid` · `materiaal` · `materieel` · `onderaannemer` ·
  `overig` — bepaalt de kolom in UI-2 en de AK-over-OA-grondslag
- `staartPercentage` op `staart_*`-rijen; `verrekenbaar` op hoofdstukken
- `ifcGuid`: koppeling naar IFC-export

**Invariant:** de `items`-array staat altijd in hiërarchische volgorde
(kinderen aaneengesloten onder hun ouder, staartregels achteraan). De app
normaliseert dit bij elke herberekening; ook oudere/bewerkte bestanden
worden bij openen automatisch in deze volgorde gezet.

## Versiebeleid

Het `version`-veld identificeert het **formaat** (los van de app-versie).
Huidige formaatversie: **2.1.0** — één bron van waarheid in code:
`FILE_FORMAT_VERSION` in `src/services/file/fileService.ts` (de MCP-server
spiegelt deze waarde).

Regels:

1. **Elke wijziging aan het formaat → versie omhoog** en een regel in de
   versiehistorie hieronder. Releasenotes van de app vermelden de
   formaatversie wanneer die wijzigt.
2. **minor/patch omhoog = additief.** Nieuwe optionele velden. Oudere
   bestanden blijven leesbaar en worden bij openen automatisch gemigreerd
   (de migratieladder in `deserializeProject`).
3. **major omhoog = breaking.** Oudere apps kunnen het bestand niet veilig
   lezen. De app weigert bestanden met een hogere major dan hij kent, met
   de melding dat een update nodig is — er wordt nooit "half" geopend of
   bij opslaan stilletjes data weggegooid.
4. **Openen is altijd achterwaarts compatibel**: elk ouder bestand (t/m de
   eerste versies zonder `version`-veld) opent in de huidige app en wordt
   stapsgewijs naar het huidige formaat gemigreerd. Opslaan gebeurt altijd
   in het huidige formaat.

## Versiehistorie

| Formaat | Wijziging | Migratie bij openen |
|---|---|---|
| *(geen veld)* | Vroege exports met alleen `schedule`+`items` | behandeld als 1.x → volledige v1→v2-migratie |
| **1.x** | `isChapter`-boolean, `resources[]` per post, `rowType: 'normal'` | `isChapter`→`rowType:'chapter'`, `normal`→`begrotingspost`, normvelden aangevuld |
| **2.0.0** | Datamodel v2: `rowType`-enum, normvelden, `resourceType`, `tariefGroep`, `resourceLibrary`, `subSheets[]`, `offerte` | `subSheets[]` → `spreadsheets`-object; `projectInfo`/`branches` aangevuld; legacy `schedule.staartRows` → `staart_*`-rijen |
| **2.1.0** *(huidig)* | `spreadsheets`-object (bladen + actief blad), `projectInfo` (kengetallen) op schedule, `branches`-velden, `snapshots` | — |

## Relatie met IFC

`.ifcCalc` is het **werkbestand** (JSON). Daarnaast exporteert de app naar
open uitwisselformaten:

- **IFC 4x3 STEP** (`.ifc`): de begroting als `IfcCostSchedule` met geneste
  `IfcCostItem`-en (`IfcRelNests`), hoeveelheden als `IfcQuantity*`, prijzen
  als `IfcCostValue`, en de Open Calc Studio-specifieke velden (normen,
  tariefgroep, resourcetype, staartpercentages) als IFC-properties. Het
  **IFC-tabblad** in de app toont deze export live voor het actieve
  document, met syntax-kleuring.
- **.ifcx (JSON)**: experimentele JSON-variant van dezelfde structuur.

Velden zonder IFC-equivalent (spreadsheetbladen, offerteteksten,
bedrijfslogo's) leven bewust alleen in `.ifcCalc`; de IFC-export is een
kostenstructuur-uitwisseling, geen volledige projectbackup.

## Richtlijn bij een release met formaatwijziging

1. Bump `FILE_FORMAT_VERSION` (fileService) én de gespiegelde constante in
   `mcp-server/src/index.ts`.
2. Voeg de migratiestap toe in `deserializeProject` (oud → nieuw).
3. Vul de versiehistorie in dit document aan.
4. Vermeld de formaatversie in de releasenotes van de app-release.
5. Draai de bestandstests (`fileService`-roundtrip + `ifcRoundtrip`).
