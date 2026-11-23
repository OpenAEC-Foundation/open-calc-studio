# Price library format

Open Calc Studio works with two kinds of price libraries:

- **Country libraries** (issue #93): built into the app, one per country. This guide describes their file format, so you can contribute one for your country.
- **Own libraries** (issue #104): files you import yourself, such as your company rates or a supplier price list. See [Own libraries](#own-libraries) below; they use the same JSON format, or a simple CSV/Excel table.

An estimate can use several libraries at once. In the library dialog (Budget → Price library) you switch each library on or off for the estimate you are working on.

## Where it lives

- One file per country: `src/data/price-libraries/<CC>.json`, where `<CC>` is the ISO 3166-1 alpha-2 code (`BE`, `IN`, `ES`, …).
- Register it in `src/data/price-libraries/index.ts`:

  ```ts
  import NL from './NL.json';
  import IN from './IN.json';

  export const PRICE_LIBRARY_FILES = { NL, IN };
  ```

That is all. The country then shows up under "With a price library" in the library dialog, and estimates set to that country use it.

## File

```json
{
  "version": 1,
  "name": "India: example library",
  "region": "IN",
  "currency": "INR",
  "description": "What this library is, where the prices come from, and what users must check.",
  "resources": [
    {
      "id": "in-example-001",
      "code": "IN.EX.001",
      "description": "Excavation by machine, all kinds of soil",
      "unit": "m³",
      "resourceType": "materieel",
      "category": "Earth work",
      "defaultUnitPrice": null,
      "referenceUnitPrice": 210.5,
      "source": "Name of the price list or schedule of rates, edition and item number",
      "priceDate": "2023-04-01",
      "priceStatus": "unverified",
      "region": "IN",
      "currency": "INR",
      "vatBasis": "excl"
    }
  ]
}
```

(An illustration of the format: the article and price are made up.)

### Library fields

| Field | Required | Meaning |
|---|---|---|
| `name` | yes | Name of the library. **Together with `id` it forms every article ID: never change it once the library is released**, or price links in saved estimates break. |
| `id` | no | Stable catalogue ID. If present it is used instead of `name`; recommended for new libraries (for example `"oc-price-library-IN"`). |
| `version` | yes | Version of the file. Raise it when prices change; the price-update dialog compares versions. |
| `currency` | yes | ISO 4217 code of the prices (`EUR`, `INR`, …). Used when an article has no `currency` of its own. |
| `region` | yes | ISO 3166-1 alpha-2 code, the same as the file name. |
| `description` | yes | What the library is and what users must check before using it. |
| `resources` | yes | The articles. |

### Article fields

| Field | Required | Meaning |
|---|---|---|
| `id` | yes* | Unique within the file and stable over versions (it is part of the price link). *If missing, `code` is used. |
| `code` | yes | Code shown to the user. |
| `description` | yes | Name of the resource in the country's language. |
| `unit` | yes | One of the supported units below. Any other unit stays visible but cannot be added to an estimate until a conversion is defined; it is never silently treated as pieces. |
| `resourceType` | yes | `arbeid` (labour), `materiaal` (material), `materieel` (equipment), `onderaannemer` (subcontractor) or `overig` (other). |
| `category` | yes | Group shown on the left of the library dialog. |
| `defaultUnitPrice` | yes | The **verified** price per unit, or `null`. Only a verified price with a source and a reference date belongs here; the app copies it into the estimate. Must be a finite number ≥ 0. |
| `referenceUnitPrice` | no | An unverified indication. Shown as "unverified reference", never copied into the estimate. |
| `source` | yes | Where the price comes from: price list, schedule of rates, quotation, … |
| `priceDate` | yes | Reference date of the price (`YYYY-MM-DD`), or `null` when unknown. |
| `priceStatus` | no | `verified` or `unverified`. Recorded for reviewers; the app decides by `defaultUnitPrice`. |
| `vatBasis` | no | `excl`, `incl` or `unknown`. Recorded for reviewers; not yet used by the app. |
| `currency`, `region` | no | Per-article override of the library values. |

### Supported units

`uur` (hour), `dgn`/`dag` (day), `week`, `mnd` (month), `m`/`m1`, `m2`/`m²`, `m3`/`m³`, `kg`, `ton`, `km`, `st`/`stuk` (piece), `post`, `ls` (lump sum), `%`, `pm` (provisional), `keer` (times).

## Rules for a contribution

1. **No unverified price in `defaultUnitPrice`.** Put indications in `referenceUnitPrice` and leave `defaultUnitPrice` `null` until a source and reference date back it up. A missing price is better than a wrong one: users see "enter price" and check it.
2. Names in the language of the country.
3. Stable `id`s: never reuse or renumber them in a later version.
4. Make sure you may publish the prices (licence of the price list or schedule of rates) and name it in `source`.
5. Add a test like `src/test/dutchPriceLibrary.test.ts`: the file parses, IDs are unique, and only dated prices with a source are active.

## Own libraries

Import a file with **Price library → Import library…** in the library dialog. The app keeps it on this computer (desktop: `price-libraries.json` in the app-data folder; web: browser storage) and switches it on for the current estimate. Other estimates can switch it on too.

| You can | How |
|---|---|
| Import | *Import library…*: library JSON, CSV, Excel (`.xlsx`, `.xls`) or a BMEcat/DICO catalogue (`.xml`). *Backstage → Import → BMEcat* does the same. |
| Update | *New version…* next to the library (hover over it). The library keeps its catalogue ID, so price links in estimates stay valid, even when the new file has another name. The app lists the codes that are no longer in the new version; rows that use them keep their price. |
| Rename | *Rename*: only the name you see changes, not the catalogue ID. |
| Remove | *Remove*: the library leaves this computer. Rows in estimates keep their prices; estimates that use the library say it is missing. |

Article IDs follow the same rule as for country libraries: `<catalogue ID>:<article id>`. For a JSON file the catalogue ID is its `id`, else its `name`; for a table or BMEcat file it is the file name without extension. Give a JSON library a stable `id` if you will send newer versions.

### JSON

The [library JSON format](#file) above. Only `resources` is required; `name`, `id`, `version` and `currency` are recommended.

Example: [`docs/examples/own-price-library.json`](examples/own-price-library.json).

### CSV and Excel

One header row, then one row per resource. The app recognises the columns by their header (English or Dutch, case and accents ignored). CSV may use `;`, `,` or tab between values; a price may use a decimal comma (`1.250,50`) or a decimal point (`1,250.50`).

| Column | Required | Headers it recognises | Meaning |
|---|---|---|---|
| Code | yes | `Code`, `Id`, `Item`, `Article code`, `Artikelcode` | Code of the resource; also its article ID. |
| Description | yes | `Description`, `Omschrijving`, `Name`, `Naam` | Name of the resource. |
| Unit | no | `Unit`, `Eenheid` | One of the [supported units](#supported-units). Empty: `st` (piece). |
| Price | no | `Price`, `Unit price`, `Rate`, `Cost`, `Prijs`, `Eenheidsprijs` | Price per unit. Empty: no price; the estimate asks for one. |
| Type | no | `Type`, `Resource type`, `Soort` | `labour`, `material`, `equipment`, `subcontractor`, `other` (or the Dutch words). Otherwise the app guesses from the category. |
| Category | no | `Category`, `Categorie`, `Group`, `Chapter`, `Section` | Group shown on the left of the library dialog. |
| Price date | no | `Price date`, `Date`, `Prijsdatum`, `Peildatum` | Reference date as `YYYY-MM-DD`. |
| Source | no | `Source`, `Bron` | Where the price comes from. Empty: the file name. |

Example: [`docs/examples/own-price-list.csv`](examples/own-price-list.csv). Open it in Excel and save it as `.xlsx` to try the Excel import.

A file without a code and a description column is refused with a message that lists the columns found, and a price that is not a number is refused with its row number. Nothing is imported then.
