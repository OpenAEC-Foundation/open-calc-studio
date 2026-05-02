# Open Calc Studio

> Open-source begrotingsprogramma voor de Nederlandse bouw — een moderne, vrije opvolger van klassieke calculatietools (BasCalc, WPCalc).

[![Status](https://img.shields.io/badge/status-public%20testing-orange)](https://github.com/OpenAEC-Foundation/open-calc-studio/releases)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Tauri](https://img.shields.io/badge/Tauri-2-24C8DB)](https://v2.tauri.app/)
[![React](https://img.shields.io/badge/React-18-61DAFB)](https://react.dev/)

![Open Calc Studio](docs/screenshot.png)

Open Calc Studio brengt professionele kostencalculatie voor de bouw naar een open, modern platform. Geen vendor-lock-in, geen abonnement, geen verborgen formaten — een desktop app met Tauri (Rust + React) en een open bestandsformaat dat je zelf kunt inspecteren.

## Status

**Public testing** — actief in ontwikkeling. Stabiel genoeg voor echt gebruik, maar verwacht nog ruwe randjes en breaking changes tussen minor versies.

## Features

### Calculatie
- Hierarchische begrotingsstructuur (hoofdstuk → begrotingspost → bewakingspost → calculatieregel)
- Cascading staartberekening: AK over onderaanneming → algemene bedrijfskosten → garanties → werkvoorbereiding → risico → winst → verzekering → BTW → afronding
- Middelclassificatie (arbeid / materiaal / materieel / onderaannemer / overig)
- Norm-berekening (productienorm, factor, deler) per regel
- Tariefgroepen (A/B/C) met instelbare uurtarieven
- Begrotingsvarianten (branches, git-achtig boommodel)
- Embedded spreadsheets voor deelberekeningen, met cell formules en cell-borders
- Snapshots / versies van een begroting

### Import & Export
- **BasCalc** (.calc/.xls) — legacy MDB import
- **WPCalc** (.calc) — round-trip (lezen + schrijven)
- **IFC 4.x** (IfcCostSchedule + IfcCostItem) — import en export, custom STEP generator (geen WASM)
- **CUF-XML / TRADXML / RAW RSX** — exporters
- **ZSX / NSX** — prijs- en normbestanden
- **Excel** (.xlsx) — spreadsheet import
- **Inschrijfstaat** — RAW-conforme export
- **Eigen formaat** — `.ocs` / `.ifcCalc` (open JSON, mens-leesbaar)

### Rapportage
- 6 rapport-views: werkbeschrijving, hoofdaanneming, onderaanneming, inschrijfstaat, nacalculatie, Bouw 1 (18-koloms uitgebreid format)
- Live preview, print en PDF-export
- Configureerbare rapport-datum, paginering en oriëntatie
- Cover-page en samenvatting opt-in

### UI
- Office-stijl ribbon (Home, Begroting, Rapportage, IFC, Spreadsheet, View)
- Persistent start sidebar met release notes en recente bestanden
- 3-paneel layout: scheduletree, grid, properties
- Multi-document support met file tabs
- Virtualized grid voor grote begrotingen
- 4 themes (light, dark, blue, high-contrast)
- Volledig keyboard-bedienbaar

### Extensions
- MCP server (`mcp-server/`) voor Claude / agentic gebruik — bouw je begroting via natural language
- Plugin-architectuur voor custom importers en domain features

## Quick start

### Download
Download de installer voor jouw platform vanaf de [releases pagina](https://github.com/OpenAEC-Foundation/open-calc-studio/releases). Windows MSI/NSIS, macOS DMG, en Linux AppImage/DEB worden gepubliceerd per release.

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

Open Calc Studio gebruikt een open JSON-formaat (`.ocs` / `.ifcCalc`). Volledig formaat in [`docs/API.md`](docs/API.md).

```json
{
  "version": "2.0.0",
  "schedule": { "name": "...", "projectName": "...", ... },
  "items": [{ "id": "...", "rowType": "chapter", ... }, ...],
  "companyInfo": { ... },
  "spreadsheets": { ... }
}
```

`rowType` is een enum: `chapter | begrotingspost | bewakingspost | regel | tekstregel | witregel | staart_*`. Staart rijen vormen de cascading toeslagen-keten.

## Voorbeeldbegroting

Bij eerste start opent Open Calc Studio automatisch een voorbeeldbegroting (`public/data/voorbeeld.ifcCalc`). 21 items, 6 hoofdstukken, kostprijs ≈ €44k. Sluit het tabblad om door te gaan met je eigen werk.

## MCP server

In `mcp-server/` zit een Model Context Protocol server zodat je Open Calc Studio kunt aansturen vanuit Claude (of andere MCP clients). Je kunt items toevoegen, hoofdstukken bouwen, staart instellen en PDF genereren — allemaal vanuit een conversatie. Zie [`mcp-server/README.md`](mcp-server/README.md).

## Contributing

Pull requests welkom. Kleine tips:
- Lees `docs/API.md` voor de domain model
- TS en Rust moeten beide groen blijven (`npm test` + `cargo check`)
- Geen vendor-specifieke logo's of brand data toevoegen — de `tenants/bouw1/` brand is een neutraal startpunt waar gebruikers op kunnen variëren

Issues, ideeën en bugmeldingen graag via de [issue tracker](https://github.com/OpenAEC-Foundation/open-calc-studio/issues).

## License

MIT — zie [LICENSE](LICENSE).

## Acknowledgements

- [Tauri](https://tauri.app/) — een fantastisch lichtgewicht alternatief voor Electron
- [Typst](https://typst.app/) — moderne typesetting voor onze PDF templates
- De [buildingSMART](https://www.buildingsmart.org/) IFC-standaard voor cost schedules
- Iedereen die geprobeerd heeft een open formaat in Nederland te krijgen voor bouwbegrotingen — dit project bouwt op die schouders
