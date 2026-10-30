# Open Calc Studio

> Open-source begrotingsprogramma voor de Nederlandse bouw — een moderne, vrije opvolger van klassieke calculatietools (BasCalc, WPCalc).

[![Status](https://img.shields.io/badge/status-public%20testing-orange)](https://github.com/OpenAEC-Foundation/open-calc-studio/releases)
[![License](https://img.shields.io/badge/license-LGPL--3.0--only-blue.svg)](LICENSE)
[![Tauri](https://img.shields.io/badge/Tauri-2-24C8DB)](https://v2.tauri.app/)
[![React](https://img.shields.io/badge/React-18-61DAFB)](https://react.dev/)

![Open Calc Studio](docs/screenshots/nl/1-begroting.png)

Open Calc Studio brengt professionele kostencalculatie voor de bouw naar een open, modern platform. Geen vendor-lock-in, geen abonnement, geen verborgen formaten — een desktop app met Tauri (Rust + React) en een open bestandsformaat dat je zelf kunt inspecteren.

## Status

**Public testing** — actief in ontwikkeling. Stabiel genoeg voor echt gebruik, maar verwacht nog ruwe randjes en breaking changes tussen minor versies.

## Gebruikershandleiding / User guide

Begin met de [Nederlandse gebruikershandleiding](docs/gebruikershandleiding.md) of de [English user guide](docs/user-guide.md): installatie, je eerste begroting, uren en staart, opslaan, import/export en rapportage. Een [wiki-indeling](wiki/Home.md) met Nederlandstalige pagina's is voorbereid voor publicatie op de GitHub-wiki.

Voor begroten met tekstprompts naast het raster: [Prompt & Begroot](docs/prompt-begroot.md).

Voor bewerken op Android of iPhone: [mobiele webapp](docs/mobiele-webapp.md).

Voor ondersteunde buitenlandse begrotingsbestanden en beperkingen: [Internationale bestandsuitwisseling](docs/wereldwijde-uitwisseling.md).

Voor tekeningen, kalibratie en hoeveelhedenkoppelingen: [PDF-metingen en Open PDF Studio](docs/pdf-studio-integration.md). Voor AI- of automatiseringsclients: [desktopbediening via MCP](docs/mcp-desktop.md). Voor modelhoeveelheden: [3D & Begroting met IFC-Lite](docs/ifc-lite-splitview.md).

Start de app niet op macOS? Zie de [macOS-opstartinstructies](docs/macos-startup.md).

## Features

### Calculatie
- Hierarchische begrotingsstructuur (hoofdstuk → begrotingspost → bewakingspost → calculatieregel)
- Cascading staartberekening: AK over onderaanneming → algemene bedrijfskosten → garanties → werkvoorbereiding → risico → winst → verzekering → BTW → afronding
- Middelclassificatie (arbeid / materiaal / materieel / onderaannemer / overig)
- Norm-berekening (productienorm, factor, deler) per regel
- Tariefgroepen (A/B/C) met instelbare uurtarieven
- Begrotingsvarianten (branches, git-achtig boommodel)
- Uren naar rato: bewerk een uren-totaal (alles, per tariefgroep of per hoofdstuk) en de onderliggende normen schalen automatisch mee
- Embedded spreadsheets voor deelberekeningen, met cell formules en cell-borders
- Snapshots / versies van een begroting
- Automatisch opslaan (elke 2 minuten, stil, voor documenten met een bestandslocatie)

### Import & Export
- **BasCalc** (.calc/.xls) — legacy MDB import
- **WPCalc** (.calc) — round-trip (lezen + schrijven)
- **IBIS-TRAD** (.xtb) — import (SQLite), inclusief middelen en uurloon-codes
- **IFC 4.x** (IfcCostSchedule + IfcCostItem) — import en export, custom STEP generator (geen WASM)
- **FIEBDC-3** (.bc3, Spanje) — import en export
- **ÖNORM A 2063** (.onlv Leistungsverzeichnis, .onlb Leistungsbuch, Oostenrijk) — import en export, gevalideerd tegen de officiële XSD's
- **GAEB DA XML** (.x81/.x82/.x83/.x86/.x87, Duitsland) — bestekimport; .x84-aanbiedingsprijzen kunnen op een geopend .x83-bestek worden toegepast
- **CUF-XML / RAW RSX** — import en export; **TRADXML** — export
- **ZSX / NSX** — prijs- en normbestanden
- **Excel** (.xlsx) — spreadsheet import
- **Inschrijfstaat** — RAW-conforme export
- **Eigen formaat** — `.ocs` / `.ifcCalc` (open JSON, mens-leesbaar)

### Rapportage
- 7 rapport-views: werkbeschrijving, hoofdaanneming, onderaanneming, inschrijfstaat, nacalculatie, Bouw 1 (18-koloms uitgebreid format) en Bouw 2 (IBIS-stijl)
- Live preview, print en PDF-export
- Configureerbare rapport-datum, paginering en oriëntatie
- Cover-page en samenvatting opt-in

### UI
- Mobiele webapp met aanraakvriendelijke begrotingseditor, deelbladcellen, Prompt & Begroot en lokaal conceptherstel
- Office-stijl ribbon voor commando's (Bestand, Begroting, Rapportage, Spreadsheet, IFC)
- **Onderbalk-navigatie per document**: Data · Uren & Staart · Rapport · Spreadsheet · IFC · 3D & Begroting · PDF & metingen · Prompt & Begroot
- Gesplitste 3D-weergave met IFC-Lite: selecteer elementen en koppel benoemde hoeveelheden aan begrotingsregels
- PDF-tekeningen, schaal en metingen worden in het native begrotingsbestand bewaard; koppeling met Open PDF Studio via expliciete export/import
- Prompt & Begroot toont voorgestelde wijzigingen vóór toepassing in de begroting
- Bestand-menu als links uitklappend paneel (niet schermvullend)
- Rijen selecteren en verslepen via de grip-gutter links — ook naar een ander hoofdstuk
- Persistent start sidebar met release notes en recente bestanden
- Eigenschappenpaneel met item-type, kengetallen (€/eenheid excl. én incl. btw); structuurpaneel optioneel
- Multi-document support met file tabs
- Virtualized grid voor grote begrotingen
- 4 themes (light, dark, blue, high-contrast)
- Volledig keyboard-bedienbaar

### OpenAEC-account (optioneel)
- **Sign in with OpenAEC** — OIDC/PKCE-login via de systeembrowser; tokens veilig in de OS-keyring
- **Cloud-opslag** met mappenbrowser: begrotingen opslaan, openen en beheren op je account
- **AI-assistent op accounttegoed** — de ingebouwde chat gebruikt AI-credits van je OpenAEC-account (met live saldo), zonder eigen API-sleutel

### Extensions
- MCP server (`mcp-server/`) voor MCP-clients — begrotingen bewerken, berekenen en geselecteerde formaten uitwisselen; [functies en beperkingen](wiki/MCP-server.md)
- Plugin-architectuur voor custom importers en domain features
- Ingebouwde importers (WPCalc, IBIS-TRAD, BasCalc, RSX, inschrijfstaat) staan standaard aan

## Quick start

### Download
Download de installer voor jouw platform vanaf de [releases pagina](https://github.com/OpenAEC-Foundation/open-calc-studio/releases). Windows MSI/NSIS, macOS DMG, en Linux AppImage/DEB worden gepubliceerd per release.

#### macOS: de app wordt geblokkeerd bij de eerste start

Lokale builds gebruiken standaard ad-hoc ondertekening. De [desktopworkflow](docs/desktop-builds.md) vereist voor CI een Developer ID-certificaat en Apple-notarisation en controleert de app uit de DMG. Controleer bij een download of die build daadwerkelijk geslaagd is. Volg de [macOS-opstartinstructies (Nederlands / English)](docs/macos-startup.md) voor hulp bij geblokkeerde oudere of lokale builds.

### Build from source

Vereisten:
- [Node.js](https://nodejs.org/) (LTS aanbevolen, zie `.nvmrc`)
- [Rust](https://www.rust-lang.org/tools/install) 1.77.2 of nieuwer
- [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/) voor jouw platform

```bash
# Clone (inclusief openaec-reports submodule)
git clone --recurse-submodules https://github.com/OpenAEC-Foundation/open-calc-studio
cd open-calc-studio

# Dependencies
npm install

# Dev mode (browser only, snel)
npm run dev

# Dev mode (Tauri desktop)
npm run tauri dev

# Productie build
npm run tauri build
```

De gebouwde applicatie staat in `src-tauri/target/release/`.

#### Windows

Op Windows: gebruik de **MinGW** Rust toolchain — geen Visual Studio nodig.

```bash
rustup default stable-x86_64-pc-windows-gnu
npx tauri build
```

## Inbouwen in je eigen site

Open Calc Studio is er ook als npm-pakket: een React-component plus de
bibliotheek (importers, exporters, calculator) — zie
[packages/embed/README.md](packages/embed/README.md).

```sh
npm install @openaec/open-calc-studio react react-dom
```

```tsx
import { OpenCalcStudio } from '@openaec/open-calc-studio';
import '@openaec/open-calc-studio/style.css';

<div style={{ height: 720 }}>
  <OpenCalcStudio lang="nl" sample onChange={(project, json) => save(json)} />
</div>
```

Elke GitHub-release levert het pakket ook als `open-calc-studio-<versie>.tgz`.
Lokaal: `npm run build:lib` bouwt het pakket naar `packages/embed/dist`,
`npm run dev:embed` opent een voorbeeld-gastpagina op http://localhost:4310.
Alle CSS is gescoped onder `.ocs-embed`, sneltoetsen gelden alleen binnen de
component en thema/taal staan op de wrapper, niet op `<html>`.

## Architectuur

```
open-calc-studio/
├── src/                     # Frontend (React + TypeScript + Vite)
│   ├── components/          # UI: ribbon, grid, panels, viewers
│   ├── state/               # Zustand store (11 slices)
│   ├── services/            # File I/O, calculation, import/export
│   ├── types/               # TypeScript domain model
│   └── i18n/                # nl-NL primair, en optioneel
├── src-tauri/               # Tauri / Rust backend
│   ├── src/
│   │   ├── reports/         # PDF generatie (Typst + custom layout)
│   │   ├── wpcalc_export.rs # WPCalc .calc round-trip
│   │   └── bin/gen_pdf.rs   # Standalone PDF CLI
│   └── tests/               # Rust integration tests
├── tenants/                 # Brand templates (logo's, fonts, Typst)
│   └── bouw1/               # Default Bouw 1 brand
├── mcp-server/              # MCP server voor Claude / agents
├── public/data/             # Sample begroting (voorbeeld.ifcCalc)
├── libs/openaec-reports/    # Submodule: openaec-reports engine
└── docs/                    # API documentatie en release notes
```

### Stack

| Laag | Technologie |
|------|------------|
| Frontend | React 18, TypeScript 5.7, Vite 6 |
| State | Zustand 5 + Immer |
| Styling | Tailwind 3.4 + CSS variables (theming) |
| Desktop | Tauri 2 (Rust 1.77+) |
| PDF | Typst (templates), openaec-layout (Rust crate) |
| Tests | Vitest (unit), Playwright (E2E), Rust `cargo test` |
| MCP | `@modelcontextprotocol/sdk` |

## Bestandsformaat

Open Calc Studio gebruikt een open JSON-formaat (`.ocs` / `.ifcCalc`), huidige formaatversie **2.2.0**. Het formaat is gedocumenteerd in [`docs/ifccalc-formaat.md`](docs/ifccalc-formaat.md) (structuur, versiebeleid en migratiegaranties); de API in [`docs/API.md`](docs/API.md). Oudere bestanden openen altijd (automatische migratie); bestanden uit een nieuwere major-versie worden met een duidelijke melding geweigerd.

```json
{
  "version": "2.2.0",
  "schedule": { "name": "...", "projectName": "...", ... },
  "items": [{ "id": "...", "rowType": "chapter", ... }, ...],
  "companyInfo": { ... },
  "spreadsheets": { ... }
}
```

`rowType` is een enum: `chapter | begrotingspost | bewakingspost | regel | tekstregel | witregel | staart_*`. Staart rijen vormen de cascading toeslagen-keten.

## Voorbeeldbegroting

Bij eerste start opent Open Calc Studio automatisch een voorbeeldbegroting (`public/data/voorbeeld.ifcCalc`). 21 items, 6 hoofdstukken, kostprijs ≈ €44k. Sluit het tabblad om door te gaan met je eigen werk.

## Native DLL en applicatiebuild

De volledige desktopapp kan als native bibliotheek worden gebouwd: `OpenCalcStudio.dll`
op Windows en `libOpenCalcStudio.so` op Linux. De C-entrypoint `ocs_run()` opent een
eigen applicatievenster en keert bij sluiten terug naar de host. Dit is geen .NET-
assembly of inbouwbaar child-window control. Gebruik de [native handleiding](packages/native/README.md)
voor de C-header, voorbeeldhost, buildstappen en levensduurvoorwaarden. De bestaande
MCP/API blijft beschikbaar zolang het venster draait.

De workflow `Native DLL and library builds` levert ongetekende testpakketten;
`Signed desktop test builds` levert bij geldige signing-secrets ook een
ondertekend Windows-DLL-pakket. Een lokale Windows-crossbuild controleert de
bestandsstructuur en exports, maar bewijst geen werking van de Windows-interface.

## MCP server

In `mcp-server/` zit een Model Context Protocol-server voor Claude en andere MCP-clients. Je kunt begrotingen openen en bewerken, rekenen en onder meer BC3, ÖNORM, CUF, RAW en GAEB importeren. `get_capabilities` geeft de actuele lijst. De `app_*`-tools bedienen de draaiende desktopapp, inclusief PDF-metingen en IFC-Lite-selectie en hoeveelhedenovername. `app_list_actions` beschrijft 202 store-acties plus de bestands- en vieweropdrachten. GAEB-export en de nog niet geïmplementeerde leveranciersformaten blijven buiten het bereik. Zie de [gebruikerspagina](wiki/MCP-server.md) en de [technische instructies](mcp-server/README.md).

## Contributing

Pull requests welkom. Kleine tips:
- Lees `docs/API.md` voor de domain model
- TS en Rust moeten beide groen blijven (`npm test` + `cargo check`)
- Geen vendor-specifieke logo's of brand data toevoegen — de `tenants/bouw1/` brand is een neutraal startpunt waar gebruikers op kunnen variëren

Issues, ideeën en bugmeldingen graag via de [issue tracker](https://github.com/OpenAEC-Foundation/open-calc-studio/issues).

## License

Open Calc Studio: **LGPL-3.0-only**. De volledige teksten zijn beschikbaar als
[LICENSE](LICENSE) (LGPL versie 3) en [COPYING](COPYING) (GPL versie 3).
Zie [NOTICE.md](NOTICE.md) voor de afbakening van de productlicentie en
licenties van derden. Het inbouwpakket bevat deze drie bestanden ook.

## Acknowledgements

- [Tauri](https://tauri.app/) — een fantastisch lichtgewicht alternatief voor Electron
- [Typst](https://typst.app/) — moderne typesetting voor onze PDF templates
- De [buildingSMART](https://www.buildingsmart.org/) IFC-standaard voor cost schedules
- Iedereen die geprobeerd heeft een open formaat in Nederland te krijgen voor bouwbegrotingen — dit project bouwt op die schouders
