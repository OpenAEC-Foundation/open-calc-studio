# FIEBDC-3 (.bc3) — verification files

Real-world files in the Spanish exchange format FIEBDC-3, collected from
public sources (no login or registration), plus one synthetic example. They
are the input of the round-trip test `src/test/bc3Roundtrip.test.ts`
(import → export → import again → compare); the result is in
[RAPPORT.md](RAPPORT.md).

The test skips this directory when it is absent, so CI does not break.

## Files

Program and format version come from the `~V` record of the file itself
(fields 3 and 2); the charset from field 5. "Lines" is the number of text
lines (CRLF); most records fit on one line, `~T` texts run on.

| File | Source | Program (from ~V) | Format | Charset | Lines | Bytes |
| --- | --- | --- | --- | --- | ---: | ---: |
| `BCCA2023_V02.bc3` | Junta de Andalucía, Base de Costes de la Construcción de Andalucía 2023 — https://www.juntadeandalucia.es/sites/default/files/inline-files/2024/01/BCCA2023_V02.zip | Presto 22.01 | FIEBDC-3/2020 | ANSI | 35,920 | 4,376,644 |
| `corsam_presupuesto.bc3` | https://raw.githubusercontent.com/carlosmorenolosa/frontend_corsam/main/presupuesto.bc3 | Presto 8.8 | FIEBDC-3/2002 | ANSI (content is double-encoded UTF-8, see below) | 546 | 80,557 |
| `fjht_018-12.bc3` | https://raw.githubusercontent.com/fjht/bc3/master/018-12.bc3 | Presto 11.02 | FIEBDC-3/2002 | ANSI | 623 | 71,144 |
| `fjht_018-12_con_resumen.bc3` | https://raw.githubusercontent.com/fjht/bc3/master/018-12_con_resumen.bc3 | ARPO-BC3 | FIEBDC-3/2002 | ANSI | 623 | 72,938 |
| `fjht_prueba.bc3` | https://raw.githubusercontent.com/fjht/bc3/master/prueba.bc3 | Presto 11.02 | FIEBDC-3/2002 | ANSI | 16 | 442 |
| `fjht_vua1.bc3` | https://raw.githubusercontent.com/fjht/bc3/master/vua1.bc3 | CYPE, Predimensionador para viviendas unifamiliares aisladas | FIEBDC-3/2002 | ANSI | 4,132 | 385,812 |
| `pycost_guadix.bc3` | https://raw.githubusercontent.com/xc-structural-engineering/pyCost/master/old/ejemplos/guadix.bc3 | Iturribizia ppl 0.1 | FIEBDC-3/95 | (not declared; DOS/CP850) | 1,606 | 161,013 |
| `pycost_measurement_outside_chapter.bc3` | https://raw.githubusercontent.com/xc-structural-engineering/pyCost/master/verif/tests/data/bc3/measurement_outside_chapter.bc3 | Presto 22.03 | FIEBDC-3/2020 | ANSI (content is UTF-8) | 226 | 17,424 |
| `pycost_planta.bc3` | https://raw.githubusercontent.com/xc-structural-engineering/pyCost/master/old/test/planta/planta.bc3 | Iturribizia ppl 0.1 | FIEBDC-3/95 | (not declared; DOS/CP850) | 658 | 85,242 |
| `pycost_pp.bc3` | https://raw.githubusercontent.com/xc-structural-engineering/pyCost/master/old/ejemplos/pp.bc3 | — (fragment with only ~M records, no ~V) | — | — | 501 | 36,317 |
| `pycost_ref_write_01.bc3` | https://raw.githubusercontent.com/xc-structural-engineering/pyCost/master/verif/tests/data/bc3/ref_test_write_bc3_01.bc3 | pyCost 0.2 | FIEBDC-3/2020 | ANSI | 197 | 501,540 |
| `pycost_sch_base.bc3` | https://raw.githubusercontent.com/xc-structural-engineering/pyCost/master/old/ejemplos/sahechores/sch_base.bc3 | Iturribizia ppl 0.1 | FIEBDC-3/95 | (not declared; DOS/CP850) | 1,526 | 137,708 |
| `pycost_sispre_PUEBLA-EE.bc3` | https://raw.githubusercontent.com/xc-structural-engineering/pyCost/master/old/ejemplos/sispre/auding/PUEBLA-EE.BC3 | TCQ 2.1 | FIEBDC-3/98 | ANSI | 458 | 37,417 |
| `pycost_sispre_murcia5.bc3` | https://raw.githubusercontent.com/xc-structural-engineering/pyCost/master/old/ejemplos/sispre/murcia5.bc3 | Presto 7.00 | FIEBDC-3/95 | (not declared; DOS/CP850) | 1,681 | 131,075 |
| `pycost_sispre_puebla-oc.bc3` | https://raw.githubusercontent.com/xc-structural-engineering/pyCost/master/old/ejemplos/sispre/auding/puebla-oc.BC3 | TCQ 2.1 | FIEBDC-3/98 | ANSI | 937 | 88,373 |
| `pycost_test_file_05.bc3` | https://raw.githubusercontent.com/xc-structural-engineering/pyCost/master/verif/tests/data/bc3/test_file_05.bc3 | Arquímedes (CYPE) | FIEBDC-3/2004 | ANSI (content is UTF-8 with double-encoded quotation marks) | 2,028 | 151,244 |
| `pycost_test_file_06.bc3` | https://raw.githubusercontent.com/xc-structural-engineering/pyCost/master/verif/tests/data/bc3/test_file_06.bc3 | CYPE, Generador de precios de la construcción | FIEBDC-3/2016 | ANSI (content is UTF-8) | 115 | 4,593 |
| `pycost_test_file_11.bc3` | https://raw.githubusercontent.com/xc-structural-engineering/pyCost/master/verif/tests/data/bc3/test_file_11.bc3 | TEST | FIEBDC-3/2016 | 850 | 98 | 7,587 |
| `pycost_test_parametric_02.bc3` | https://raw.githubusercontent.com/xc-structural-engineering/pyCost/master/verif/tests/data/bc3/test_parametric_02.bc3 | pyCost 1.0 | FIEBDC-3/2007 | utf-8 | 121 | 5,377 |
| `tocbim_FirstStreet_corridor_PRES.bc3` | https://raw.githubusercontent.com/JardiMargalefAgusti/TOC-BIM-Viewer/master/app-mcp/public/test/FirstStreet_corridor_PRES.bc3 | IFC2BC3_Claude | FIEBDC-3/2012 | ANSI | 50 | 6,822 |
| `tocbim_MVC-Brises.bc3` | https://raw.githubusercontent.com/JardiMargalefAgusti/TOC-BIM-Viewer/master/app-mcp/public/test/MVC-Brises.bc3 | Presto 25.00 | FIEBDC-3/2020 | ANSI (content is UTF-8) | 3,975 | 522,978 |
| `synthetisch-voorbeeld.bc3` | own minimal example (root, chapter, two items, labour + material, ~M and ~T) | Open Calc Studio | FIEBDC-3/2004 | ANSI | 14 | 481 |

All files are smaller than 5 MB and are kept here as copies; the BCCA
(4.4 MB, 46,215 rows after import) is the largest. The zip from the Junta de
Andalucía contains documentation next to the .bc3; only the .bc3 was taken.

## What makes these files special

- **The declared charset is often wrong.** Presto 22/25 and Arquímedes
  write UTF-8 with "ANSI" in the `~V` record; FIEBDC-3/95 does not declare a
  charset and is DOS (CP850); `corsam_presupuesto.bc3` contains text that
  was encoded twice (read as ISO-8859-1, written as UTF-8). The importer
  decides on the bytes, not on the declaration.
- **Duplicate codes.** `pycost_planta.bc3` uses chapter code `4.1` twice for
  two different chapters (`~C|4.1#||Alumbrado|…` and `~C|4.1#||Fuerza|…`);
  only their order in the parent's breakdown tells them apart. The same for
  chapter `2` (`Viales` and `Abastecimiento de agua`).
- **Auxiliary prices as resources.** BCCA (4,301 times), Arquímedes and TCQ
  put composed concepts ("precios auxiliares") into the breakdown of an
  item. They become one resource row with the price of the auxiliary
  concept; the auxiliary's own breakdown does not fit the OCS model. BCCA
  and Arquímedes use the 2-decimal `~C` price of the auxiliary as resource
  price while its breakdown yields more decimals (`DEXZANJAT`: 3.06 versus
  3.054465, see RAPPORT.md).
- **Yield 0.** BCCA (7 items), Arquímedes (2), ppl (1) and pyCost (1) have
  breakdown lines with yield 0 next to normal lines;
  `corsam_presupuesto.bc3` has *only* yield 0 (then the `~C` price counts).
- **Codes with a `#` on non-chapters.** BCCA has items with unit `u` whose
  code ends in `#` (`~C|18CPI000301#|u|Ensayo transparencia sónica…|346.5|`).
  The `#` is a structure marker in BC3 and is dropped from the code.
- **Many decimals.** ppl writes yields with 15 decimals (float noise such as
  `0.004999999888241`), TCQ too; `~M` totals have up to 5 decimals. With
  totals of hundreds of millions (`pycost_sch_base`, `pycost_planta`,
  `pycost_guadix`) every decimal counts.
- **Percentage rows.** `%` codes are usually surcharges over the preceding
  lines (`%CI`, `%003`, `IS13` with unit `%`), but `pycost_guadix.bc3` uses
  `%7` as an ordinary resource (yield × price), and Presto 7 (`murcia5`:
  `03.284` with unit `%` and price 2.5) and Presto 22 (BCCA: `IS13` with
  unit `%` and price 29.45) computed such lines as price × yield as well.
  The importer votes per concept for the reading that reproduces the item
  prices in the `~C` records; only `TIPO = %`, or unit `%` without a price,
  is a hard marker.
- **TCQ auxiliary costs.** In the TCQ files the `A%…` concepts "Despeses
  auxiliars" are a percentage over the *labour* lines only, not over all
  preceding lines. Only that reading reproduces the item prices of
  `puebla-oc.BC3`; `PUEBLA-EE.BC3` additionally carries 5 % indirect costs
  in its item prices that are not in the file (see RAPPORT.md).
- **Indirect costs in the totals, not in the file.** The chapter and root
  prices of `pycost_test_file_05.bc3` (Arquímedes) are Σ quantity ×
  round(item price × 1.02, 2): 2 % indirect costs applied per item, while
  the `~C` item prices are the direct cost and the percentage is stored
  nowhere. RAPPORT.md shows the calculation for chapter `CAP1.1`.
- **Empty short descriptions.** `fjht_018-12.bc3` (Presto 11) leaves the
  `~C` description of all 198 items empty and puts the text in `~T`
  (`~C|02.01|m3||3|170712|0|`); `fjht_018-12_con_resumen.bc3` (ARPO) does so
  for 116 of them. The importer takes the first line of the `~T` text as
  the description and keeps the full text as notes.
- **No prices.** `tocbim_MVC-Brises.bc3` and `pycost_test_parametric_02.bc3`
  are measurement/parameter libraries without prices; `pycost_pp.bc3`
  contains only `~M` records.
- **Fragments.** `pycost_measurement_outside_chapter.bc3` references chapters
  it does not contain (`~D|02.03.01#|02.03.01.01\1\1\…` without a `~C` for
  `02.03.01.01`), and `pycost_test_file_11.bc3` has a root concept with a
  price but without a breakdown. Their root prices belong to the complete
  projects, not to the fragments.
- **Internal inconsistencies in the source** (not importer errors):
  `pycost_sch_base.bc3` has items `1201`/`1205` with `~C` price 1 while
  their breakdown says 134 and 136 million, and its chapter and root prices
  were computed with that 1; `corsam_presupuesto.bc3` has chapter prices
  that do not follow from the items (`C15#`: 48,338.18 stored, 544,467.50
  from its items × quantities) while the root price is exactly the sum of
  those stale chapter prices; `pycost_test_file_11.bc3` has an item price
  that does not match its breakdown (`GAG030`: 33.20 stored, 34.14
  composed). The importer reports items that are off by more than 2 % with
  both amounts. The section "Deviations explained" in RAPPORT.md quotes the
  records.
- **Rounding in the source program.** Presto 7 (`murcia5`) rounds item
  prices to 2 decimals and item totals to whole pesetas; Presto 11
  (`fjht_018-12`) sums cent-rounded item totals; pyCost 0.2
  (`ref_write_01`) writes yields with 3 decimals but computed its prices
  with more; ppl 0.1 (`guadix`, `planta`) stores chapter prices that
  differ from the sum of its own items by up to 46 on a billion. None of
  these exceeds 0.04 % on the root.

## Checking the import

Check: the price on the root concept (`~C` with `##`) is the project total.
The column "Deviation of import vs. file" in RAPPORT.md compares the
bottom-up direct cost with it. Files whose root price is 0, or belongs to a
larger project (fragments, price books), are marked there. The table "Import
against the file itself" goes one level deeper: every chapter price and
every item price stored in the file against our calculation, so that a
deviation can be traced to the records that cause it.

## Specification

https://www.fiebdc.es/format-fiebdc/ (FIEBDC-3/2024 and /2020, also in
English). FIEBDC also offers a free validator ("BC3 Checker").
