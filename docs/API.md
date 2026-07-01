# Open Calc Studio — API Documentatie

> Versie 2.1.0 | Stack: Vite 6 + React 18 + TypeScript 5.7 + Zustand 5 + Tauri 2

---

## 1. Bestandsformaat (.ifcx)

Open Calc Studio slaat projecten op als `.ifcx` bestanden (JSON). Het formaat is gebaseerd op het `ProjectFile` type.

### 1.1 ProjectFile (root)

| Veld | Type | Omschrijving |
|------|------|-------------|
| `version` | `string` | Bestandsversie, momenteel `"2.1.0"` (zie docs/ifccalc-formaat.md) |
| `schedule` | `CostSchedule` | Projectmetadata en begrotingsgegevens |
| `items` | `CostItem[]` | Alle begrotingsregels (platte lijst met parentId-verwijzingen) |
| `resourceLibrary` | `ResourceLibraryItem[]` | Middelenbibliotheek (optioneel) |
| `companyInfo` | `CompanyInfo` | Bedrijfsgegevens |
| `subSheets` | `SubSheet[]` | Deelberekeningen / hulpbladen |
| `offerte` | `OfferteDocument` | Offertedocument (optioneel) |
| `snapshots` | `ProjectSnapshot[]` | Versie-snapshots (optioneel) |
| `brandSlug` | `string` | Huisstijlreferentie, bijv. `"bouw1"` (optioneel) |
| `createdAt` | `string` | ISO 8601 aanmaakdatum |
| `modifiedAt` | `string` | ISO 8601 wijzigingsdatum |

### 1.2 CostSchedule

| Veld | Type | Omschrijving |
|------|------|-------------|
| `id` | `string` | UUID |
| `name` | `string` | Naam van de begroting |
| `description` | `string` | Omschrijving |
| `status` | `'DRAFT' \| 'FINAL' \| 'REVISED'` | Status |
| `predefinedType` | `'BUDGET' \| 'ESTIMATE' \| 'TENDER'` | Type begroting |
| `currency` | `string` | Valuta (standaard `"EUR"`) |
| `projectName` | `string` | Projectnaam |
| `projectNumber` | `string` | Projectnummer |
| `client` | `string` | Opdrachtgever |
| `author` | `string` | Auteur/calculator |
| `ifcGuid` | `string` | IFC GlobalId (22 tekens) |
| `uitvoeringskosten` | `number` | UKK percentage |
| `algemeneKosten` | `number` | AK percentage |
| `winstRisico` | `number` | W&R percentage |
| `tarieven` | `Record<string, number>` | Uurtarieven per tariefgroep, bijv. `{ "A": 64, "B": 43 }` |
| `staartRows` | `StagartRow[]` | Geimporteerde staartkosten-breakdown (optioneel) |
| `projectProperties` | `ProjectProperty[]` | Kengetallen (Bruto inhoud, BVO, etc.) |

### 1.3 CostItem

| Veld | Type | Omschrijving |
|------|------|-------------|
| `id` | `string` | UUID |
| `parentId` | `string \| null` | Verwijzing naar bovenliggend item |
| `sortOrder` | `number` | Sorteervolgorde binnen siblings |
| `code` | `string` | Bestekscode / itemcode |
| `description` | `string` | Omschrijving |
| `unit` | `CostUnit` | Eenheid (`st`, `m`, `m2`, `m3`, `kg`, `uur`, etc.) |
| `quantity` | `number \| null` | Hoeveelheid |
| `materialPrice` | `number \| null` | Materiaalprijs per eenheid |
| `laborPrice` | `number \| null` | Loonprijs per eenheid |
| `unitPrice` | `number` | Eenheidsprijs (berekend) |
| `total` | `number` | Totaalbedrag (berekend) |
| `rowType` | `RowType` | Regeltype (zie 1.4) |
| `depth` | `number` | Nestingdiepte (0 = toplevel) |
| `nr` | `string` | Hiearchisch nummer, bijv. `"01.02.03"` |
| `staartPercentage` | `number \| null` | Opslagpercentage (alleen staart-rijen) |
| `normQuantity` | `number \| null` | Productienorm / aantal (voor `regel` rijen) |
| `normFactor` | `number \| null` | Productiefactor (voor `regel` rijen) |
| `normDivisor` | `number \| null` | Productiecapaciteit (voor `regel` rijen) |
| `normUnitPrice` | `number \| null` | Prijs per middel (voor `regel` rijen) |
| `resourceType` | `ResourceType \| null` | Middeltype (`arbeid`, `materiaal`, `materieel`, `onderaannemer`, `overig`) |
| `resourceLibraryId` | `string \| null` | Referentie naar middelenbibliotheek |
| `tariefGroep` | `'A' \| 'B' \| 'C' \| null` | Tariefgroep voor loonberekening |
| `verrekenbaar` | `'V' \| 'A' \| 'N' \| 'F' \| null` | RAW verrekenbaarheid |
| `isCollapsed` | `boolean` | Ingeklapt in grid |
| `notes` | `string` | Notities |
| `ifcGuid` | `string` | IFC GlobalId |

### 1.4 RowType (regeltypen)

| RowType | Omschrijving | Nesting |
|---------|-------------|---------|
| `chapter` | Hoofdstuk / Paragraaf | Kan kinderen bevatten |
| `begrotingspost` | Bestekspost (ih) | Kan kinderen bevatten |
| `bewakingspost` | Bewakingspost (cb) | Kan kinderen bevatten |
| `regel` | Middel / resource (cn) | Blad-item |
| `tekstregel` | Tekstregel / opmerking | Blad-item |
| `witregel` | Witomschrijving | Blad-item |
| `staart_ukk` | Uitvoeringskosten opslag | Toplevel staart |
| `staart_ak` | Algemene kosten opslag | Toplevel staart |
| `staart_wr` | Winst & Risico opslag | Toplevel staart |
| `staart_afronding` | Afronding | Toplevel staart |

### 1.5 CompanyInfo

| Veld | Type |
|------|------|
| `name` | `string` |
| `postalAddress` | `string` |
| `postalCity` | `string` |
| `visitAddress` | `string` |
| `visitCity` | `string` |
| `phone` | `string` |
| `fax` | `string` |
| `email` | `string` |

### 1.6 OfferteDocument

| Veld | Type | Omschrijving |
|------|------|-------------|
| `id` | `string` | UUID |
| `type` | `'particulier' \| 'raw' \| 'eenvoudig'` | Offertetype |
| `offerteNummer` | `string` | Offertenummer |
| `offerteDatum` | `string` | Datum (ISO date) |
| `geldigheid` | `number` | Geldigheid in dagen |
| `geadresseerde` | `OfferteGeadresseerde` | Ontvanger (naam, adres, postcode, plaats) |
| `begeleidendSchrijven` | `string` | Begeleidende tekst |
| `secties` | `OfferteSection[]` | Offertesecties |
| `betalingstermijnen` | `BetalingsTermijn[]` | Betalingstermijnen |
| `garanties` | `Garantie[]` | Garantiebepalingen |
| `voorwaarden` | `string` | Algemene voorwaarden |
| `ondertekening` | `Ondertekenaar[]` | Ondertekenaars |

### 1.7 ProjectSnapshot (versioning)

| Veld | Type | Omschrijving |
|------|------|-------------|
| `id` | `string` | UUID |
| `label` | `string` | Versielabel, bijv. `"Versie 31-03-2026"` |
| `timestamp` | `string` | ISO datetime |
| `type` | `'verstuurd' \| 'concept' \| 'definitief' \| 'gewijzigd'` | Versietype |
| `notitie` | `string` | Gebruikersnotitie |
| `schedule` | `CostSchedule` | Snapshot van metadata |
| `items` | `CostItem[]` | Snapshot van alle items |
| `offerte` | `OfferteDocument` | Snapshot van offerte (optioneel) |
| `totaalExclBtw` | `number` | Berekend totaal op moment van snapshot |

### 1.8 SubSheet (deelberekeningen)

| Veld | Type | Omschrijving |
|------|------|-------------|
| `id` | `string` | UUID |
| `name` | `string` | Bladnaam |
| `columns` | `number` | Aantal kolommen (standaard 10) |
| `rows` | `number` | Aantal rijen (standaard 50) |
| `cells` | `Record<string, SubSheetCell>` | Cellen geindexeerd op `"A1"`, `"B2"`, etc. |
| `columnWidths` | `Record<number, number>` | Kolombreedtes (optioneel) |

Celformules beginnen met `=` en worden geevalueerd tot een numeriek resultaat in `computed`.

### 1.9 Migratie

Het systeem ondersteunt automatische migratie van v1 naar v2:
- `isChapter: true` wordt `rowType: 'chapter'`
- `rowType: 'normal'` wordt `rowType: 'begrotingspost'`
- Bestanden zonder `version` veld worden als v1 behandeld

### 1.10 Voorbeeld bestandsstructuur

```json
{
  "version": "2.1.0",
  "schedule": {
    "id": "...",
    "name": "Nieuwbouw woning",
    "projectName": "Villa Den Haag",
    "projectNumber": "2026-001",
    "client": "Gemeente Den Haag",
    "status": "DRAFT",
    "predefinedType": "ESTIMATE",
    "currency": "EUR",
    "tarieven": { "A": 64, "B": 43, "C": 82 },
    "uitvoeringskosten": 5,
    "algemeneKosten": 6,
    "winstRisico": 2
  },
  "items": [
    {
      "id": "...",
      "parentId": null,
      "rowType": "chapter",
      "code": "01",
      "description": "Grondwerk",
      "depth": 0,
      "total": 15000
    }
  ],
  "companyInfo": {
    "name": "Bouwbedrijf B.V.",
    "phone": "010-1234567"
  },
  "createdAt": "2026-03-01T10:00:00.000Z",
  "modifiedAt": "2026-03-15T14:30:00.000Z"
}
```

---

## 2. Tauri Commands (Rust Backend)

De Rust backend biedt drie invoke handlers, beschikbaar via `invoke()` vanuit de frontend.

### 2.1 `generate_pdf_report`

Genereert een PDF-rapport en schrijft het naar schijf.

| Parameter | Type | Omschrijving |
|-----------|------|-------------|
| `request` | `ReportRequest` | Rapportconfiguratie (zie 2.4) |
| `outputPath` | `string` | Absoluut pad voor het PDF-bestand |

**Return:** `Result<(), string>` (foutmelding bij falen)

```typescript
await invoke('generate_pdf_report', {
  request: {
    schedule: { name: 'Begroting', projectName: 'Villa', ... },
    items: [...],
    reportView: 'nacalculatie',
    pageSize: 'A4',
    pageOrientation: 'landscape',
    showHoeveelheid: true,
    companyInfo: { name: 'Bouwbedrijf B.V.', ... },
    includeCover: true,
    includeSummary: true,
  },
  outputPath: 'C:/Users/user/Documents/rapport.pdf',
});
```

### 2.2 `generate_pdf_preview`

Genereert een PDF in het geheugen en retourneert de bytes (voor preview in de UI).

| Parameter | Type | Omschrijving |
|-----------|------|-------------|
| `request` | `ReportRequest` | Rapportconfiguratie (zie 2.4) |

**Return:** `Result<Vec<u8>, string>` (PDF bytes of foutmelding)

### 2.3 `export_wpcalc`

Exporteert de begroting naar een WpCalc `.calc` bestand (Access MDB).

| Parameter | Type | Omschrijving |
|-----------|------|-------------|
| `request` | `WpCalcExportRequest` | Exportdata |
| `outputPath` | `string` | Absoluut pad voor het .calc bestand |

**Return:** `Result<(), string>`

Het exportproces:
1. Kopieert een template MDB naar het doelpad
2. Bouwt een PowerShell-script dat via ADO rijen invoegt in de MDB-tabellen
3. Voert het script uit via `powershell -NoProfile -NonInteractive`

#### WpCalcExportRequest

```typescript
{
  schedule: {
    name: string,
    projectName: string,
    projectNumber: string,
    client: string,
    author: string,
    algemeneKosten: number,
    winstRisico: number,
    tarieven: Record<string, number>,
    staartRows: StagartRow[],
  },
  items: WpCalcCostItem[],
  companyInfo: { name: string, postalAddress: string, postalCity: string },
}
```

### 2.4 ReportRequest

| Veld | Type | Standaard | Omschrijving |
|------|------|-----------|-------------|
| `schedule` | `Schedule` | verplicht | Projectgegevens |
| `items` | `CostItem[]` | verplicht | Begrotingsregels |
| `reportView` | `string` | verplicht | Rapporttype (zie sectie 6) |
| `pageSize` | `string` | `"A4"` | Papierformaat (`A4` of `A3`) |
| `pageOrientation` | `string` | `"landscape"` | Orientatie (`landscape` of `portrait`) |
| `showHoeveelheid` | `boolean` | `true` | Toon hoeveelheidkolommen |
| `companyInfo` | `CompanyInfo` | `null` | Bedrijfsgegevens voor koptekst |
| `includeCover` | `boolean` | `false` | Voorblad genereren |
| `includeSummary` | `boolean` | `false` | Samenvattingspagina genereren |

---

## 3. Extensie Systeem

Het extensiesysteem is gemodelleerd naar Open 2D Studio en biedt een plugin-architectuur voor importers, exporters en UI-uitbreidingen.

### 3.1 Overzicht

- **Opslag:** IndexedDB (`ocs-extensions` database) voor gebruikersextensies; ingebouwde extensies zijn altijd beschikbaar
- **Sandbox:** Extensiecode wordt uitgevoerd via `new Function()` met een beperkte `require()` functie
- **Levenscyclus:** Installeren -> Laden -> Inschakelen (`onLoad`) -> Uitschakelen (`onUnload`) -> Verwijderen
- **Catalog URL:** `https://raw.githubusercontent.com/OpenAEC-Foundation/open-calc-studio-extensions/main/catalog.json`

### 3.2 Manifest (manifest.json)

Elk extensie-ZIP bevat een `manifest.json`:

```json
{
  "id": "mijn-extensie",
  "name": "Mijn Extensie",
  "version": "1.0.0",
  "minAppVersion": "0.1.0",
  "author": "Ontwikkelaar",
  "description": "Beschrijving van de extensie",
  "category": "Import/Export",
  "main": "main.js",
  "permissions": ["commands", "events", "ribbon"],
  "repository": "https://github.com/user/repo",
  "tags": ["import", "excel"],
  "icon": "<svg>...</svg>"
}
```

#### Categorieen

| Categorie | Omschrijving |
|-----------|-------------|
| `Import/Export` | Bestanden importeren/exporteren |
| `Calculation` | Rekenregels en formules |
| `Reporting` | Rapportage-uitbreidingen |
| `Utility` | Hulpmiddelen |
| `Other` | Overig |

#### Permissies

| Permissie | Omschrijving |
|-----------|-------------|
| `commands` | Tauri commands uitvoeren |
| `ribbon` | Knoppen toevoegen aan het lint |
| `backstage` | Panelen toevoegen aan het Backstage-menu |
| `events` | Event bus gebruiken |
| `filesystem` | Bestandssysteem-toegang |
| `network` | Netwerktoegang |

### 3.3 Plugin Interface

Het `main.js` bestand moet een `onLoad` functie exporteren:

```javascript
// main.js
module.exports = {
  onLoad(api) {
    // Extensie initialiseren
    api.importers.register({
      id: 'mijn-importer',
      name: 'Mijn Formaat (.xyz)',
      description: 'Importeer bestanden in XYZ-formaat',
      fileExtensions: ['.xyz'],
      handler: async (file) => {
        const text = await file.text();
        return {
          schedule: { name: 'Geimporteerd project', ... },
          items: [...],
        };
      },
    });
  },

  onUnload() {
    // Opruimen bij uitschakelen (optioneel)
  },
};
```

Voor eenvoudige JS-extensies (zonder ZIP) kan het manifest als commentaar worden opgenomen:

```javascript
/** @manifest {
  "id": "mijn-script",
  "name": "Mijn Script",
  "version": "1.0.0",
  "category": "Utility"
} */
module.exports = {
  onLoad(api) { ... },
};
```

### 3.4 ExtensionApi

De API die aan `onLoad` wordt meegegeven:

#### `api.importers`

| Methode | Omschrijving |
|---------|-------------|
| `register(def: ImporterDefinition)` | Registreer een bestandsimporter |
| `unregister(id: string)` | Verwijder een importer |

#### `api.data`

| Methode | Omschrijving |
|---------|-------------|
| `getItems()` | Haal alle CostItems op |
| `getSchedule()` | Haal de CostSchedule op |
| `setItems(items)` | Stel nieuwe items in |
| `setSchedule(schedule)` | Stel nieuwe schedule in |
| `recalculate()` | Herbereken alle items |
| `pushHistory(label)` | Sla huidige staat op voor undo |

#### `api.events`

| Methode | Omschrijving |
|---------|-------------|
| `on(event, listener)` | Luister naar een event (retourneert unsubscribe functie) |
| `off(event, listener)` | Verwijder een listener |
| `emit(event, data?)` | Zend een event uit |

Vereist permissie: `events`

#### `api.ui`

| Methode | Omschrijving |
|---------|-------------|
| `addRibbonButton(reg)` | Voeg een knop toe aan het lint |
| `addBackstagePanel(reg)` | Voeg een paneel toe aan Backstage |
| `showNotification(msg, type?)` | Toon een melding (`info`, `warning`, `error`) |

#### `api.settings`

| Methode | Omschrijving |
|---------|-------------|
| `get<T>(key, defaultValue)` | Lees een instelling (localStorage) |
| `set<T>(key, value)` | Schrijf een instelling |

Instellingen worden opgeslagen onder het prefix `ext:{extensionId}:`.

### 3.5 Installatiemethoden

| Methode | Functie | Omschrijving |
|---------|---------|-------------|
| ZIP bestand | `installFromFile()` | Upload een ZIP met manifest.json + main.js |
| JS bestand | `installFromJsFile()` | Upload een enkel .js bestand |
| Catalogus | `installFromCatalog(entry)` | Installeer vanuit de online catalogus |
| Ingebouwd | `registerBuiltinExtensions()` | Automatisch bij opstarten |

### 3.6 Ingebouwde extensies

| ID | Naam | Bestandstypen |
|----|------|---------------|
| `builtin-bascalc-importer` | BasCalc Importer | `.xls`, `.xlsx` |
| `builtin-wpcalc-importer` | WpCalc Importer | `.calc`, `.mdb` |
| `builtin-rsx-importer` | RAW Bestek Importer | `.rsx` |
| `builtin-inschrijfstaat-importer` | Inschrijfstaat Importer | `.xls`, `.xlsx` |
| `builtin-wpcalc-exporter` | WpCalc Exporter | `.calc` |

---

## 4. IFC Export (IFC4X3 STEP + IfcX)

Open Calc Studio exporteert begrotingsdata naar twee IFC-formaten.

### 4.1 IFC4X3 STEP Export

Functie: `generateIfcCostFile(schedule, items): string`

Genereert een volledig IFC4X3 STEP bestand met de volgende entiteiten:

| IFC Entiteit | Omschrijving |
|-------------|-------------|
| `IFCPROJECT` | Project met GlobalId, naam, omschrijving |
| `IFCOWNERHISTORY` | Auteur en applicatiegegevens |
| `IFCORGANIZATION` | Organisatie (Open Calc Studio) |
| `IFCAPPLICATION` | Applicatieversie |
| `IFCUNITASSIGNMENT` | SI-eenheden (meter, m2, m3, kg, seconde) + EUR |
| `IFCMONETARYUNIT` | Valuta (EUR) |
| `IFCCOSTSCHEDULE` | Begrotingsmetadata met type en status |
| `IFCCOSTITEM` | Per CostItem: code, omschrijving |
| `IFCCOSTVALUE` | Materiaal- en/of loonprijs met `MATERIAL`/`LABOR` categorie |
| `IFCQUANTITY*` | Hoeveelheden (Length/Area/Volume/Weight/Time/Count) |
| `IFCRELNESTS` | Ouder-kind relaties (hierarchie) |
| `IFCPROPERTYSET` | Custom properties: `OCS_ItemProperties`, `OCS_Tarieven`, `OCS_ProjectMetrics` |
| `IFCRELDEFINESBYPROPERTIES` | Koppeling propertyset aan entiteit |

**Custom IfcPropertySet per item (`OCS_ItemProperties`):**

| Property | Type | Omschrijving |
|----------|------|-------------|
| `rowType` | `IfcLabel` | Regeltype |
| `tariefGroep` | `IfcLabel` | A/B/C (optioneel) |
| `resourceType` | `IfcLabel` | Middeltype (optioneel) |
| `verrekenbaar` | `IfcLabel` | V/A/N (optioneel) |
| `staartPercentage` | `IfcReal` | Opslagpercentage (optioneel) |

### 4.2 IfcX JSON Export (IFC5-development)

Functie: `generateIfcxJson(schedule, items, offerte?): string`

Produceert een hierarchisch JSON-document conform het IFC5-development (IfcX alpha) formaat.

#### Documentstructuur

```json
{
  "header": {
    "id": "uuid-v4",
    "version": "ifcx_alpha",
    "author": "Open Calc Studio",
    "timestamp": "2026-03-15T14:30:00.000Z",
    "description": "Cost schedule export: Begroting"
  },
  "imports": [
    { "uri": "https://ifcx.dev/@standards.buildingsmart.org/ifc/core/ifc@v5a.ifcx" }
  ],
  "schemas": {},
  "data": [
    {
      "path": "/Project/VillaDenHaag",
      "inherits": ["IfcProject"],
      "attributes": { ... },
      "children": {
        "CostSchedules": {
          "path": "/Project/VillaDenHaag/CostSchedules/Begroting",
          "inherits": ["IfcCostSchedule"],
          "attributes": { ... },
          "children": { ... }
        }
      }
    }
  ]
}
```

#### IfcX naamruimten (attribute keys)

| Naamruimte | Omschrijving |
|------------|-------------|
| `bsi::ifc::prop::Name` | IFC standaard naam |
| `bsi::ifc::prop::Description` | IFC standaard omschrijving |
| `bsi::ifc::prop::Quantity` | Hoeveelheid met eenheid |
| `ifcx::cost::breakdown` | Kostenbreakdown (materiaal/loon/materieel/onderaanneming) |
| `ifcx::cost::materialPrice` | Materiaalprijs |
| `ifcx::cost::laborPrice` | Loonprijs |
| `ifcx::cost::unitPrice` | Eenheidsprijs |
| `ifcx::cost::total` | Totaalbedrag |
| `ifcx::cost::phase` | NEN 2699:2017 fase (voor staartkosten) |
| `ifcx::cost::metadata` | Tarieven en opslagpercentages |
| `ifcx::cost::currency` | Valuta met BTW-info |
| `ifcx::ocs::rowType` | OCS regeltype |
| `ifcx::ocs::normCalculation` | Normberekening (quantity, factor, divisor, unitPrice) |
| `ifcx::ocs::tariefGroep` | Tariefgroep (A/B/C) |
| `ifcx::ocs::resourceType` | Middeltype |
| `ifcx::ocs::verrekenbaar` | Verrekenbaarheid |
| `ifcx::ocs::projectMetrics` | Kengetallen (bruto inhoud, BVO, prijs/eenheid) |
| `ifcx::contract::quote` | Offertegegevens |
| `ifcx::contract::recipient` | Geadresseerde |
| `ifcx::contract::paymentSchedule` | Betalingstermijnen |
| `ifcx::contract::warranties` | Garanties |
| `ifcx::contract::conditions` | Algemene voorwaarden |

#### NEN 2699:2017 fase-mapping (staartkosten)

| RowType | Fase | Subfase | Omschrijving |
|---------|------|---------|-------------|
| `staart_ukk` | B (Bouwkosten) | B3 | Uitvoeringskosten |
| `staart_ak` | C (Bijkomende kosten) | C1 | Algemene kosten |
| `staart_wr` | C (Bijkomende kosten) | C2 | Winst en risico |

---

## 5. Rekenmodel

Bron: `src/services/calculation/calculator.ts`

### 5.1 Overzicht

De functie `recalculateItems(items, tarieven?)` voert de volledige berekening uit in vier passen:

1. **Loonprijzen herberekenen** uit tariefgroep + tarieven
2. **Bladwaarden berekenen** (regels en begrotingsposten zonder kinderen)
3. **Bottom-up sommering** voor containers (hoofdstukken, begrotingsposten, bewakingsposten)
4. **Staartkosten cascade** (UKK -> AK -> W&R -> Afronding)
5. **Hiearchische nummering** (Nr veld: `"01.02.03"`)

### 5.2 Regelberekening (RowType = `regel`)

```
hoeveelheid = quantity * normQuantity / normFactor

Als laborPrice > 0 OF normQuantity = 0:
    unitPrice = quantity * (normUnitPrice + laborPrice)    // WpCalc-model
Anders:
    unitPrice = hoeveelheid * normUnitPrice                // Resource-model

total = unitPrice
```

### 5.3 Begrotingspost zonder kinderen

```
unitPrice = materialPrice + laborPrice
total = quantity * unitPrice
```

### 5.4 Begrotingspost met kinderen (bottom-up)

```
total = SOM(children.total)                   // alleen niet-staart kinderen
unitPrice = total / quantity                  // afgeleide waarde
```

### 5.5 Loonberekening via tariefgroep

Wanneer `tarieven` worden meegegeven:

```
Als rowType = 'regel' EN tariefGroep is ingesteld:
    laborPrice = normQuantity * tarieven[tariefGroep]
```

### 5.6 Staartkosten (cascading surcharges)

De staartkosten bouwen voort op de kostprijs en op elkaar:

```
kostprijs = SOM(toplevel items excl. staart)

UKK:
    total = kostprijs * (percentage / 100)
    runningTotal = kostprijs + UKK.total

AK:
    total = runningTotal * (percentage / 100)
    runningTotal += AK.total

W&R:
    total = runningTotal * (percentage / 100)
    runningTotal += WR.total

Afronding:
    afgerond = AFRONDEN(runningTotal, 10)  // naar dichtstbijzijnde 10
    total = afgerond - runningTotal

aanneemsom = runningTotal + afronding
```

### 5.7 Beschikbare functies

| Functie | Return | Omschrijving |
|---------|--------|-------------|
| `recalculateItems(items, tarieven?)` | `CostItem[]` | Volledige herberekening |
| `getGrandTotal(items)` | `number` | Aanneemsom incl. afronding |
| `getKostprijs(items)` | `number` | Kostprijs (directe kosten) |
| `getStaartBreakdown(items)` | `StaartBreakdown` | Volledige staartkosten-breakdown |

#### StaartBreakdown

| Veld | Type | Omschrijving |
|------|------|-------------|
| `kostprijs` | `number` | Directe kosten |
| `ukkAmount` | `number` | Uitvoeringskosten bedrag |
| `ukkPercentage` | `number` | UKK percentage |
| `subtotaal1` | `number` | Kostprijs + UKK |
| `akAmount` | `number` | Algemene kosten bedrag |
| `akPercentage` | `number` | AK percentage |
| `subtotaal2` | `number` | Subtotaal1 + AK |
| `wrAmount` | `number` | Winst & Risico bedrag |
| `wrPercentage` | `number` | W&R percentage |
| `aanneemsom` | `number` | Subtotaal2 + W&R |
| `afronding` | `number` | Afrondingsbedrag |
| `aanneemsomAfgerond` | `number` | Definitieve aanneemsom |

---

## 6. Rapportage

### 6.1 Frontend Print Service

Bron: `src/services/print/printService.ts`

#### Rapportviews

| View | Omschrijving | Zichtbare regels | Kolommen |
|------|-------------|-----------------|---------|
| `werkbeschrijving` | Werkbeschrijving | chapters + begrotingsposten | Code, Omschrijving, Hoeveelheid, Eenheid, Verr. |
| `hoofdaanneming` | Hoofdaanneming | chapters + begrotingsposten + tekstregels | Code, Omschrijving, Hoeveelheid, Eenheid, Eenheidsprijs, Bedrag |
| `onderaanneming` | Onderaanneming | chapters + begrotingsposten | Nr, Code, Omschrijving, Bedrag |
| `inschrijfstaat` | Inschrijfstaat | alle (excl. staart/witregel) | Nr, Code, Omschrijving, Hoeveelheid, Eenheid, Verr., Eenheidsprijs, Bedrag |
| `nacalculatie` | Nacalculatie | alle (excl. staart/witregel) | Nr, Code, Omschrijving, Hoeveelheid, Eenheid, Prijs/middel, Eenheidsprijs, Bedrag |
| `bouw1` | Bouw 1 Begroting | alle | Hst, Par, Nr, Omschrijving, Aantal, Eh, Prijs, Norm, Uren, Tar, Loon, Materiaal, Materieel, Stelpost, Ond.aann., Kosten/eh, Subtotaal, Totaal |
| `offerte` | Offerte | n.v.t. | Eigen layout |

#### Functies

| Functie | Omschrijving |
|---------|-------------|
| `printBudget(schedule, items, view, showHoeveelheid?, companyInfo?, logoDataUrl?, orientation?, paperSize?)` | Opent printvenster in de browser |
| `generatePrintHtml(schedule, items, view, showHoeveelheid?, companyInfo?, logoDataUrl?, orientation?, paperSize?)` | Retourneert HTML-string (voor PDF-export) |

### 6.2 Bouw 1 Print Service

Bron: `src/services/print/bouw1PrintService.ts`

De Bouw 1-rapportage genereert een specifiek rapport in huisstijl met:

- Bedrijfslogo en projectmetadata in de koptekst
- 18-koloms tabel met volledige kostenbreakdown per middel
- Hoofdstuksubtotalen met kolom-breakdowns (uren, loon, materiaal, materieel, stelpost, onderaanneming)
- Samenvattingspagina: uren per tariefgroep, kolomtotalen, opslagen, BTW
- Voettekst met bedrijfsgegevens en paginanummering

### 6.3 Rust PDF Generator

Het Rust-backend (`src-tauri/src/reports/generator.rs`) genereert PDF-rapporten via de `openaec-layout` crate:

- Automatische paginering met herhaalde kopteksten
- Optioneel voorblad en samenvattingspagina
- Professionele opmaak met voettekst (bedrijfsgegevens + paginanummers)
- Ondersteuning voor alle rapportviews
- A3/A4 en landscape/portrait

---

## 7. Zustand Store (Frontend State)

De applicatiestaat wordt beheerd door een Zustand store met 15 slices.

Bron: `src/state/appStore.ts`

```typescript
import { useAppStore } from '@/state/appStore';

// Lezen
const items = useAppStore((s) => s.items);
const schedule = useAppStore((s) => s.schedule);

// Schrijven
useAppStore.getState().addChapter(null);
useAppStore.getState().recalculate();
```

### 7.1 CostScheduleSlice

| Actie | Signatuur | Omschrijving |
|-------|-----------|-------------|
| `setSchedule` | `(partial: Partial<CostSchedule>) => void` | Werk schedule velden bij |
| `resetSchedule` | `() => void` | Reset naar standaardwaarden |
| `updateTarieven` | `(tarieven: Record<string, number>) => void` | Werk tarieven bij en herbereken loonprijzen |
| `updateProjectProperty` | `(id, field, value) => void` | Werk een kengetal bij |
| `addProjectProperty` | `() => void` | Voeg een kengetal toe |
| `removeProjectProperty` | `(id: string) => void` | Verwijder een kengetal |

### 7.2 CostItemsSlice

| State | Type | Omschrijving |
|-------|------|-------------|
| `items` | `CostItem[]` | Alle begrotingsregels |

| Actie | Signatuur | Omschrijving |
|-------|-----------|-------------|
| `setItems` | `(items: CostItem[]) => void` | Vervang alle items |
| `addItem` | `(parentId, afterIndex?) => string` | Voeg begrotingspost toe, retourneert ID |
| `addChapter` | `(parentId, afterItemId?) => string` | Voeg hoofdstuk toe |
| `addBewakingspost` | `(parentId, afterItemId?) => string` | Voeg bewakingspost toe |
| `addRegel` | `(parentId, afterItemId?) => string` | Voeg rekenregel toe |
| `addTekstregel` | `(parentId, afterItemId?) => string` | Voeg tekstregel toe |
| `addWitregel` | `(parentId, afterItemId?) => string` | Voeg witregel toe |
| `deleteItem` | `(id: string) => void` | Verwijder item + subtree |
| `updateItem` | `(id, field, value) => void` | Werk een veld bij |
| `moveItem` | `(id, direction) => void` | Verplaats omhoog/omlaag |
| `indentItem` | `(id: string) => void` | Inspringen (dieper nesten) |
| `outdentItem` | `(id: string) => void` | Uitspringen (hoger nesten) |
| `toggleCollapse` | `(id: string) => void` | In-/uitklappen |
| `recalculate` | `() => void` | Herbereken alle items |
| `getVisibleItems` | `() => CostItem[]` | Gefilterd op inklapstaat |

### 7.3 SelectionSlice

| State | Type | Omschrijving |
|-------|------|-------------|
| `activeRow` | `number` | Actieve rijindex |
| `activeCol` | `number` | Actieve kolomindex |
| `selectionStart` | `number \| null` | Begin multi-selectie |
| `selectionEnd` | `number \| null` | Einde multi-selectie |
| `isEditing` | `boolean` | Cel in bewerkingsmodus |
| `editValue` | `string` | Huidige bewerkingswaarde |

| Actie | Signatuur | Omschrijving |
|-------|-----------|-------------|
| `setActiveCell` | `(row, col) => void` | Stel actieve cel in |
| `setActiveCellExtend` | `(row, col) => void` | Extend selectie naar cel |
| `setSelectionRange` | `(start, end) => void` | Stel selectiebereik in |
| `clearSelection` | `() => void` | Wis selectie |
| `getSelectedRowIndices` | `() => number[]` | Geselecteerde rij-indexen |
| `startEditing` | `(initialValue?) => void` | Start celbewerking |
| `stopEditing` | `() => void` | Stop celbewerking |
| `setEditValue` | `(value: string) => void` | Werk bewerkingswaarde bij |

### 7.4 ViewSlice

| State | Type | Omschrijving |
|-------|------|-------------|
| `scrollTop` | `number` | Scrollpositie |
| `viewportHeight` | `number` | Viewport hoogte |
| `columnWidths` | `number[]` | Kolombreedtes (standaard grid) |
| `wpcalcColumnWidths` | `number[]` | Kolombreedtes (WpCalc view) |
| `inschrijfstaatColumnWidths` | `number[]` | Kolombreedtes (Inschrijfstaat view) |

| Actie | Signatuur | Omschrijving |
|-------|-----------|-------------|
| `setScrollTop` | `(v: number) => void` | Stel scrollpositie in |
| `setViewportHeight` | `(v: number) => void` | Stel viewport hoogte in |
| `setColumnWidth` | `(index, width) => void` | Wijzig kolombreedte |
| `getActiveColumnWidths` | `() => number[]` | Breedtes voor huidige gridview |

### 7.5 UiSlice

| State | Type | Omschrijving |
|-------|------|-------------|
| `theme` | `ThemeName` | Thema (`default`, `light`, `dark`, `blue`, `amber-navy`, `warm-ember`, `highContrast`) |
| `activeDialog` | `DialogType` | Open dialoog (`settings`, `about`, `company`, `wizard`, `null`) |
| `activeContentTab` | `ContentTab` | Actief tabblad (`grid`, `rapport`, `samenvatting`, `ifc`, `offerte`) |
| `reportMode` | `ReportMode` | Rapportmodus (`client`, `internal`) |
| `reportView` | `ReportView` | Rapporttype |
| `showHoeveelheid` | `boolean` | Toon hoeveelheidkolommen |
| `pageOrientation` | `PageOrientation` | Pagina-orientatie |
| `pageSize` | `PageSize` | Papierformaat |
| `gridView` | `GridView` | Grid weergave (`st`, `wpcalc`, `inschrijfstaat`) |
| `gridZoom` | `number` | Zoomniveau (50-200%) |
| `includeCover` | `boolean` | Voorblad meenemen |
| `includeSummary` | `boolean` | Samenvattingspagina meenemen |

Alle velden hebben corresponderende setter-methoden (`setTheme`, `setReportView`, `toggleHoeveelheid`, etc.).

### 7.6 HistorySlice

| State | Type | Omschrijving |
|-------|------|-------------|
| `undoStack` | `HistoryEntry[]` | Undo-stapel (max 50) |
| `redoStack` | `HistoryEntry[]` | Redo-stapel |

| Actie | Signatuur | Omschrijving |
|-------|-----------|-------------|
| `pushHistory` | `(items, description) => void` | Sla huidige staat op |
| `undo` | `() => CostItem[] \| null` | Ongedaan maken |
| `redo` | `() => CostItem[] \| null` | Opnieuw |
| `canUndo` | `() => boolean` | Is undo beschikbaar? |
| `canRedo` | `() => boolean` | Is redo beschikbaar? |

### 7.7 ClipboardSlice

| Actie | Signatuur | Omschrijving |
|-------|-----------|-------------|
| `copyItems` | `(items: CostItem[]) => void` | Kopieer items naar klembord |
| `cutItems` | `(items: CostItem[]) => void` | Knip items (kopieer + markeer voor verwijdering) |
| `pasteItems` | `() => void` | Plak items na actieve rij |
| `clearClipboard` | `() => void` | Wis klembord |

### 7.8 DocumentSlice

| State | Type | Omschrijving |
|-------|------|-------------|
| `documents` | `DocumentTab[]` | Open documenten/tabbladen |
| `activeDocumentId` | `string` | Actief document ID |

| Actie | Signatuur | Omschrijving |
|-------|-----------|-------------|
| `addDocument` | `(tab?: Partial<DocumentTab>) => void` | Open nieuw document |
| `removeDocument` | `(id: string) => void` | Sluit document |
| `setActiveDocument` | `(id: string) => void` | Schakel naar document |
| `updateDocument` | `(id, partial) => void` | Werk documentgegevens bij |

### 7.9 CompanySlice

| State | Type |
|-------|------|
| `companyInfo` | `CompanyInfo` |

| Actie | Signatuur |
|-------|-----------|
| `setCompanyInfo` | `(info: CompanyInfo) => void` |

### 7.10 ResourceLibrarySlice

| State | Type | Omschrijving |
|-------|------|-------------|
| `resourceLibrary` | `ResourceLibraryItem[]` | Middelenbibliotheek |
| `resourcePickerOpen` | `boolean` | Is de picker open? |
| `resourcePickerParentId` | `string \| null` | Bovenliggende post ID |

| Actie | Signatuur | Omschrijving |
|-------|-----------|-------------|
| `setResourceLibrary` | `(items) => void` | Vervang bibliotheek |
| `loadLibraryFromJson` | `(json) => void` | Laad uit JSON |
| `openResourcePicker` | `(parentId) => void` | Open middelen-picker |
| `closeResourcePicker` | `() => void` | Sluit middelen-picker |

### 7.11 ExtensionSlice

| State | Type | Omschrijving |
|-------|------|-------------|
| `installedExtensions` | `Record<string, InstalledExtension>` | Geinstalleerde extensies |
| `extensionRibbonButtons` | `ExtensionRibbonButton[]` | Lint-knoppen van extensies |
| `extensionBackstagePanels` | `ExtensionBackstagePanel[]` | Backstage-panelen van extensies |
| `extensionImporters` | `ExtensionImporter[]` | Importers van extensies |
| `catalogEntries` | `CatalogEntry[]` | Beschikbare extensies in catalogus |
| `catalogLoading` | `boolean` | Catalogus wordt geladen |
| `catalogError` | `string \| null` | Catalogusfout |

| Actie | Signatuur | Omschrijving |
|-------|-----------|-------------|
| `registerExtension` | `(ext) => void` | Registreer een extensie |
| `unregisterExtension` | `(id) => void` | Verwijder een extensie |
| `setExtensionStatus` | `(id, status, error?) => void` | Stel status in |
| `addExtensionImporter` | `(imp) => void` | Registreer importer |
| `removeExtensionImporter` | `(extId, impId) => void` | Verwijder importer |
| `addExtensionRibbonButton` | `(btn) => void` | Registreer lint-knop |
| `removeExtensionRibbonButton` | `(extId, label) => void` | Verwijder lint-knop |
| `addExtensionBackstagePanel` | `(panel) => void` | Registreer paneel |
| `removeExtensionBackstagePanel` | `(extId, panelId) => void` | Verwijder paneel |
| `removeAllExtensionUI` | `(extId) => void` | Verwijder alle UI van extensie |
| `setCatalog` | `(entries, timestamp) => void` | Stel catalogus in |
| `setCatalogLoading` | `(loading) => void` | Stel laadstatus in |
| `setCatalogError` | `(error) => void` | Stel foutstatus in |

### 7.12 SubSheetSlice

| State | Type | Omschrijving |
|-------|------|-------------|
| `subSheets` | `SubSheet[]` | Alle deelberekeningen |
| `activeSubSheetId` | `string \| null` | Actief blad |

| Actie | Signatuur | Omschrijving |
|-------|-----------|-------------|
| `setSubSheets` | `(sheets) => void` | Vervang alle bladen |
| `addSubSheet` | `(name?) => string` | Voeg blad toe, retourneert ID |
| `removeSubSheet` | `(id) => void` | Verwijder blad |
| `renameSubSheet` | `(id, name) => void` | Hernoem blad |
| `setActiveSubSheet` | `(id) => void` | Schakel naar blad |
| `setSubSheetCell` | `(sheetId, cellRef, value) => void` | Stel celwaarde in |
| `setSubSheetCells` | `(sheetId, cells) => void` | Stel meerdere cellen in |
| `getSubSheet` | `(id) => SubSheet \| undefined` | Haal blad op |

### 7.13 OfferteSlice

| State | Type |
|-------|------|
| `offerte` | `OfferteDocument` |
| `activeSectionId` | `string \| null` |

| Actie | Omschrijving |
|-------|-------------|
| `setOfferteType(type)` | Stel offertetype in |
| `setOfferteField(partial)` | Werk offertevelden bij |
| `setGeadresseerde(partial)` | Werk geadresseerde bij |
| `setOfferte(doc)` | Vervang volledig offertedocument |
| `resetOfferte()` | Reset naar standaardwaarden |
| `addSection(type, titel?)` | Voeg sectie toe |
| `removeSection(id)` | Verwijder sectie |
| `updateSection(id, updates)` | Werk sectie bij |
| `moveSectionUp(id)` / `moveSectionDown(id)` | Verplaats sectie |
| `addSectionItem(sectionId)` | Voeg item toe aan sectie |
| `removeSectionItem(sectionId, itemId)` | Verwijder item uit sectie |
| `updateSectionItem(sectionId, itemId, updates)` | Werk item bij |
| `addBetalingsTermijn()` | Voeg betalingstermijn toe |
| `removeBetalingsTermijn(id)` | Verwijder betalingstermijn |
| `updateBetalingsTermijn(id, updates)` | Werk betalingstermijn bij |
| `addGarantie()` | Voeg garantie toe |
| `removeGarantie(id)` | Verwijder garantie |
| `updateGarantie(id, updates)` | Werk garantie bij |

### 7.14 VersionSlice

| State | Type |
|-------|------|
| `snapshots` | `ProjectSnapshot[]` |
| `selectedSnapshotId` | `string \| null` |

| Actie | Signatuur | Omschrijving |
|-------|-----------|-------------|
| `createSnapshot` | `(label, type, notitie?) => void` | Maak versie-snapshot |
| `deleteSnapshot` | `(id) => void` | Verwijder snapshot |
| `setSelectedSnapshot` | `(id) => void` | Selecteer snapshot voor vergelijking |
| `setSnapshots` | `(s) => void` | Vervang alle snapshots |
| `getDiffsWithCurrent` | `(snapshotId) => SnapshotDiff[]` | Vergelijk snapshot met huidige staat |
| `getDiffsBetween` | `(oldId, newId) => SnapshotDiff[]` | Vergelijk twee snapshots |

### 7.15 SettingsSlice

| State | Type |
|-------|------|
| `settings` | `AppSettings` |

| Actie | Signatuur | Omschrijving |
|-------|-----------|-------------|
| `setSettings` | `(settings) => void` | Vervang alle instellingen |
| `updateSettings` | `(partial) => void` | Werk instellingen bij (slaat automatisch op) |

---

## Bijlage A: Eenheden (CostUnit)

```typescript
type CostUnit = 'st' | 'm' | 'm2' | 'm3' | 'kg' | 'ton' | 'uur' |
  'dgn' | 'km' | 'keer' | 'ls' | 'week' | 'mnd' | 'post' | '%' | 'pm';
```

## Bijlage B: Debug toegang

In development modus is de store beschikbaar via de browser console:

```javascript
// Toegang tot de volledige store
window.__APP_STORE__.getState()

// Items ophalen
window.__APP_STORE__.getState().items

// Handmatig herberekenen
window.__APP_STORE__.getState().recalculate()
```
