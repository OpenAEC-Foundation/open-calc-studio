# ÖNORM A 2063 (.onlv / .onlb) — verification files

Files used to test the import and export of the Austrian exchange format
ÖNORM A 2063 (Leistungsbeschreibung, Leistungsverzeichnis). The results are
in [RAPPORT.md](RAPPORT.md); the tests are
`src/test/onlvImporter.test.ts` (synthetic fragments per schema part),
`src/test/onlbPraktijk.test.ts` (the real Leistungsbücher) and
`src/test/onlvRoundtrip.test.ts` (measurements, round trip, schema
validation; it also writes the generated block of the report).

## In this directory

| File | Origin | Content |
| --- | --- | --- |
| `LB-SCHOKO_V2021.onlb` (117 KB) | Small demo Leistungsbuch ("Schokolade") published by NEVARIS Bausoftware GmbH as sample data in its public API client repository (https://github.com/NEVARISBausoftwareGmbH/http-api-client-libs, `DemoApps/KopiereOnLbUndOnLvElementeConsoleApp/Daten/`); namespace 2021-03-01. Unmodified copy. | 1 lg, 2 ulg, 2 grundtexte, 5 folgepositionen; every kind of gap (`al`, `bl`, `blo`), a Rechenwert (`rw`), a parameter list with pictogram, a grafiktabelle and grafiklinks |
| `export/lb-schoko-lv.onlv` (14 KB) | Written by the round-trip test: a priced LV built from LB-SCHOKO, exported by Open Calc Studio (`kostenschaetzungs-lv`, namespace 2021-03-01) | Example of our output; valid against `onlv.xsd` |
| `export/voorbeeld.onlv` (17 KB) | Written by the round-trip test: the OCS example estimate `public/data/voorbeeld.ifcCalc` exported as .onlv | Example of our output for an estimate with resource rows and overheads |

## Outside the repository (too large; the tests skip them when absent)

The tests look for these files in `../verification-files/Begrotingen/ONORM-A2063/`
next to the repository (or in the directory named by the environment
variable `A2063_DIR`):

| File | Origin | Content (counted on the raw XML) |
| --- | --- | --- |
| `LB-HB-023-2021/LB-HB-023-2021.onlb` (9.1 MiB) | Standardisierte Leistungsbeschreibung Hochbau, version 023 (2025-12), Bundesministerium für Wirtschaft, Energie und Tourismus (BMWET) — https://www.bmwet.gv.at/Services/Bauservice/StandardisierteLeistungsbeschreibungen.html ; namespace 2021-03-01, written with an Austrian AVA software package | 59 lg, 725 ulg, 5,777 grundtextnummern, 19,648 folgepositionen, 40 ungeteilte positionen (669 positions without a unit = wählbare Vorbemerkungen), 13,995 Ausschreiberlücken (`al`), 4 tables, 2,391 lists |
| `LB-HB-023-2015/LB-HB-023-2015.onlb` (9.1 MiB) | Same LB, issued in schema version 2015-07-15 | Identical to the 2021 issue apart from the namespace |
| `LB-HT-014-2021/LB-HT-014-2021.onlb` (9.6 MiB) | Standardisierte Leistungsbeschreibung Haustechnik, version 014 (2025-12), same source | 50 lg, 469 ulg, 4,625 grundtextnummern, 26,439 folgepositionen, 4 ungeteilte positionen (520 without a unit), 11,237 Ausschreiberlücken, 68 tables, 599 lists |
| `LB-HT-014-2015/LB-HT-014-2015.onlb` (9.6 MiB) | Same LB, schema version 2015-07-15 | Identical apart from the namespace |
| `schema_a2063_2021-03-15/schema_a2063_2021-03-15/*.xsd` | Official XML schemas, Austrian Standards — https://www.austrian-standards.at/en/products-solutions/additional-services/download-library/supplements-oenorm-a-2063 | `onlv.xsd`, `onlb.xsd`, `ontypdef.xsd`, `ontext.xsd`, `onformel.xsd`, `onre.xsd`, `onpr.xsd`, `onix.xsd`, `onbgs.xsd`, `onbaek.xsd`, `onbpek.xsd`, `onbpel.xsd`, `readme.txt` (change log per edition of the standard) |
| `schema_a2063_2015-07-15_V2/*.xsd` | Same, edition 2015 | Used for files in the 2015-07-15 namespace |
| `Informationen-zur-ONORM-A2063.pdf` | BMWET, explanation of the changes 2015 → 2021 | |

Note: an earlier draft of this README counted `<lg>` *references* inside
`aenderungskennzeichnungen` as Leistungsgruppen (438 for LB-HB). Only
elements with a `nr` attribute are groups; the tests count those.

## Licence and use

- The standardised Leistungsbeschreibungen of the BMWET are free to
  download and may be used to draw up Leistungsverzeichnisse; selling or
  distributing them as text is not permitted. That is why only counts and
  short fragments appear in this repository, not the files themselves.
- The XSDs of Austrian Standards are freely available as a "supplement" to
  the standard; they are not in the repository either. The validation
  script (`scripts/validate-a2063.py`) refers to them by path.
- No public `.onlv` files with prices were found (tender documents are not
  freely available). The export is therefore tested with LVs generated from
  the Leistungsbücher and from the OCS example estimate, against the schema
  and through the round trip.

## Schema validation

```
python scripts/validate-a2063.py FILE.onlv [--xsd-dir DIR] [--max-errors N]
```

Picks `onlv.xsd`/`onlb.xsd` by the root element and the schema directory by
the namespace (2015 or 2021); validates with lxml (libxml2), falling back to
the `xmlschema` package. Exit code 0 = valid, 1 = invalid, 2 = file or XSD
directory missing, 3 = no validator library installed (`pip install lxml`).
