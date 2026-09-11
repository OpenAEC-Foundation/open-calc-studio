# FIEBDC-3 rondreis — rapport

Vraag: als iemand een gewone begroting als .bc3 inleest in Open Calc Studio
en hem weer als .bc3 wegschrijft, wat komt er dan uit — niets toegevoegd,
niets verloren? Getest met 21 echte bestanden van internet (Presto 7 t/m
25, Arquímedes, TCQ, ppl, pyCost, de Andalusische kostendatabase BCCA 2023)
plus één synthetisch voorbeeld; herkomst en eigenaardigheden per bestand
staan in [README.md](README.md).

Het blok "Meetresultaten" hieronder wordt door de test zelf geschreven
(`npx vitest run src/test/bc3Roundtrip.test.ts`); de tekst erna is
handmatig.

<!-- gegenereerd:begin -->
## Meetresultaten

Automatisch gegenereerd door `src/test/bc3Roundtrip.test.ts` (`npx vitest run src/test/bc3Roundtrip.test.ts`).
Rondreis: bestand importeren (A) → exporteren als .bc3 (Windows-1252) → opnieuw importeren (B) → A en B regel voor regel vergelijken.
Tolerantie voor bedragen: 0,01. "Items" telt hoofdstukken, posten en rekenregels na `recalculateItems`.

## Samenvatting

- Bestanden: 22
- Volledig identiek na de rondreis (geen enkel veldverschil): 19
- Bedragen, omschrijvingen, hoeveelheden en structuur gelijk, alleen een code met `_n`-suffix: 3
- Met andere afwijkingen: 0

## Per bestand

| Bestand | Programma / versie | Tekenset | Items A | Items B | Kostprijs A | Kostprijs B | Regels met verschil | Wortelprijs in bestand | Afwijking import t.o.v. bestand |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `BCCA2023_V02.bc3` | Presto 22.01 — FIEBDC-3/2020 | ANSI | 46215 | 46215 | 8.705.795,46 | 8.705.795,46 | 2024 | 0,00 | geen wortelprijs (0) |
| `corsam_presupuesto.bc3` | Presto 8.8 — FIEBDC-3/2002 | ANSI | 121 | 121 | 886.386,55 | 886.386,55 | 0 | 298.189,46 | 197,26 % |
| `fjht_018-12_con_resumen.bc3` | ARPO-BC3 — FIEBDC-3/2002 | ANSI | 207 | 207 | 434.687,43 | 434.687,43 | 0 | 434.687,42 | 0,00 % |
| `fjht_018-12.bc3` | Presto 11.02 — FIEBDC-3/2002 | ANSI | 207 | 207 | 434.687,43 | 434.687,43 | 0 | 434.687,42 | 0,00 % |
| `fjht_prueba.bc3` | Presto 11.02 — FIEBDC-3/2002 | ANSI | 6 | 6 | 42,50 | 42,50 | 0 | 42,50 | 0,00 % |
| `fjht_vua1.bc3` | Predimensionador para viviendas unifamiliares aisladas — FIE | ANSI | 1600 | 1600 | 176.553,34 | 176.553,34 | 0 | 0,00 | geen wortelprijs (0) |
| `pycost_guadix.bc3` | ppl 0.1 — FIEBDC-3/95 | (geen) | 2773 | 2773 | 1.474.153.917,66 | 1.474.153.917,66 | 0 | 1.474.153.876,25 | 0,00 % |
| `pycost_measurement_outside_chapter.bc3` | Pr22.03 — FIEBDC-3/2020 | ANSI | 80 | 80 | 261.178,14 | 261.178,14 | 0 | 65.324.446,79 | -99,60 % |
| `pycost_planta.bc3` | ppl 0.1 — FIEBDC-3/95 | (geen) | 351 | 351 | 119.237.094,99 | 119.237.094,99 | 2 | 119.237.089,04 | 0,00 % |
| `pycost_pp.bc3` | ? — ? | (geen) | 1 | 1 | 0,00 | 0,00 | 0 | n.v.t. | n.v.t. |
| `pycost_ref_write_01.bc3` | pyCost 0.2 — FIEBDC-3/2020 | ANSI | 114 | 114 | 1.356.377,94 | 1.356.377,94 | 0 | 1.356.866,66 | -0,04 % |
| `pycost_sch_base.bc3` | ppl 0.1 — FIEBDC-3/95 | (geen) | 895 | 895 | 1.403.378.626,36 | 1.403.378.626,36 | 0 | 1.132.583.228,56 | 23,91 % |
| `pycost_sispre_murcia5.bc3` | Presto 7.00 — FIEBDC-3/95 | (geen) | 2155 | 2155 | 845.210.719,43 | 845.210.719,43 | 0 | 845.180.002,00 | 0,00 % |
| `pycost_sispre_PUEBLA-EE.bc3` | TCQ 2.1 — FIEBDC-3/98 | ANSI | 430 | 430 | 24.353.970,99 | 24.353.970,99 | 0 | n.v.t. | n.v.t. |
| `pycost_sispre_puebla-oc.bc3` | TCQ 2.1 — FIEBDC-3/98 | ANSI | 1453 | 1453 | 32.479.934,34 | 32.479.934,34 | 0 | n.v.t. | n.v.t. |
| `pycost_test_file_05.bc3` | ARQUIMEDES — FIEBDC-3/2004 | ANSI | 800 | 800 | 688.131,27 | 688.131,27 | 5 | 697.444,60 | -1,34 % |
| `pycost_test_file_06.bc3` | Generador de precios de la construcción. CYPE Ingenieros, S. | ANSI | 9 | 9 | 2,14 | 2,14 | 0 | n.v.t. | n.v.t. |
| `pycost_test_file_11.bc3` | TEST — FIEBDC-3/2016 | 850 | 31 | 31 | 974,41 | 974,41 | 0 | 390.352,04 | -99,75 % |
| `pycost_test_parametric_02.bc3` | pyCost 1.0 — FIEBDC-3/2007 | utf-8 | 1 | 1 | 0,00 | 0,00 | 0 | n.v.t. | n.v.t. |
| `synthetisch-voorbeeld.bc3` | Open Calc Studio — FIEBDC-3/2004 | ANSI | 5 | 5 | 119,50 | 119,50 | 0 | 119,50 | 0,00 % |
| `tocbim_FirstStreet_corridor_PRES.bc3` | IFC2BC3_Claude — FIEBDC-3/2012 | ANSI | 15 | 15 | 162.087,66 | 162.087,66 | 0 | 162.087,65 | 0,00 % |
| `tocbim_MVC-Brises.bc3` | Presto 25.00 — FIEBDC-3/2020 | ANSI | 575 | 575 | 0,00 | 0,00 | 0 | 0,00 | geen wortelprijs (0) |

### BCCA2023_V02.bc3

- Schrijver: RIB Spain; programma: Presto 22.01; formaat: FIEBDC-3/2020; tekenset: ANSI
- Grootte: 4.376.644 bytes, 35.920 regels
- Items A: 46215 (chapter 2914, begrotingspost 11802, regel 31499); items B: 46215
- Kostprijs A: 8.705.795,46; B: 8.705.795,46; verschil: 0,00
- Wortelprijs volgens het bestand zelf: 0,00 (import wijkt n.v.t. af)
- Teksten (~T) als notities: A 34965 items (91 meerregelig), B 34965 (91 meerregelig)
- Hoofdstuktotalen met verschil: 0
- Tekenset van de export: ANSI
- Recordtypen origineel: ~C 15514, ~D 8426, ~K 1, ~L 1, ~T 11532, ~V 1, ~X 1
- Recordtypen export: ~C 15740, ~D 8422, ~M 11802, ~T 11758, ~V 1
- Waarschuwingen bij import A (1):
  - Bij 2 partida('s) wijkt de som van de samenstelling meer dan…
- Afwijkingen: 2024 regel(s), per veld: code 2024
  - item #6343 code: `AGM00800` → `AGM00800_1`
  - item #6346 code: `AGY00200` → `AGY00200_1`
  - item #7396 code: `01CMM90100` → `01CMM90100_1`

### corsam_presupuesto.bc3

- Schrijver: SOFT S.A.; programma: Presto 8.8; formaat: FIEBDC-3/2002; tekenset: ANSI
- Grootte: 80.557 bytes, 546 regels
- Items A: 121 (chapter 17, begrotingspost 104); items B: 121
- Kostprijs A: 886.386,55; B: 886.386,55; verschil: 0,00
- Wortelprijs volgens het bestand zelf: 298.189,46 (import wijkt 197,26 % af)
- Teksten (~T) als notities: A 95 items (14 meerregelig), B 95 (14 meerregelig)
- Hoofdstuktotalen met verschil: 0
- Tekenset van de export: ANSI
- Recordtypen origineel: ~A 3, ~C 184, ~D 51, ~K 1, ~M 102, ~T 108, ~V 1
- Recordtypen export: ~C 122, ~D 18, ~M 104, ~T 95, ~V 1
- Waarschuwingen bij import A (1):
  - Eén of meer partida's hebben een samenstelling zonder rendem…
- Afwijkingen: geen

### fjht_018-12_con_resumen.bc3

- Schrijver: SOFT S.A.; programma: ARPO-BC3; formaat: FIEBDC-3/2002; tekenset: ANSI
- Grootte: 72.938 bytes, 623 regels
- Items A: 207 (chapter 9, begrotingspost 198); items B: 207
- Kostprijs A: 434.687,43; B: 434.687,43; verschil: 0,00
- Wortelprijs volgens het bestand zelf: 434.687,42 (import wijkt 0,00 % af)
- Teksten (~T) als notities: A 198 items (5 meerregelig), B 198 (5 meerregelig)
- Hoofdstuktotalen met verschil: 0
- Tekenset van de export: ANSI
- Recordtypen origineel: ~C 208, ~D 10, ~K 1, ~M 198, ~T 198, ~V 1
- Recordtypen export: ~C 208, ~D 10, ~M 198, ~T 198, ~V 1
- Waarschuwingen bij import A: geen
- Afwijkingen: geen

### fjht_018-12.bc3

- Schrijver: SOFT S.A.; programma: Presto 11.02; formaat: FIEBDC-3/2002; tekenset: ANSI
- Grootte: 71.144 bytes, 623 regels
- Items A: 207 (chapter 9, begrotingspost 198); items B: 207
- Kostprijs A: 434.687,43; B: 434.687,43; verschil: 0,00
- Wortelprijs volgens het bestand zelf: 434.687,42 (import wijkt 0,00 % af)
- Teksten (~T) als notities: A 198 items (5 meerregelig), B 198 (5 meerregelig)
- Hoofdstuktotalen met verschil: 0
- Tekenset van de export: ANSI
- Recordtypen origineel: ~C 208, ~D 10, ~K 1, ~M 198, ~T 198, ~V 1
- Recordtypen export: ~C 208, ~D 10, ~M 198, ~T 198, ~V 1
- Waarschuwingen bij import A: geen
- Afwijkingen: geen

### fjht_prueba.bc3

- Schrijver: SOFT S.A.; programma: Presto 11.02; formaat: FIEBDC-3/2002; tekenset: ANSI
- Grootte: 442 bytes, 16 regels
- Items A: 6 (chapter 2, begrotingspost 4); items B: 6
- Kostprijs A: 42,50; B: 42,50; verschil: 0,00
- Wortelprijs volgens het bestand zelf: 42,50 (import wijkt 0,00 % af)
- Teksten (~T) als notities: A 0 items (0 meerregelig), B 0 (0 meerregelig)
- Hoofdstuktotalen met verschil: 0
- Tekenset van de export: ANSI
- Recordtypen origineel: ~C 6, ~D 3, ~K 1, ~M 4, ~V 1
- Recordtypen export: ~C 6, ~D 3, ~M 4, ~V 1
- Waarschuwingen bij import A: geen
- Afwijkingen: geen

### fjht_vua1.bc3

- Schrijver: CYPE INGENIEROS, S.A.; programma: Predimensionador para viviendas unifamiliares aisladas; formaat: FIEBDC-3/2002; tekenset: ANSI
- Grootte: 385.812 bytes, 4.132 regels
- Items A: 1600 (chapter 67, begrotingspost 209, regel 1324); items B: 1600
- Kostprijs A: 176.553,34; B: 176.553,34; verschil: 0,00
- Wortelprijs volgens het bestand zelf: 0,00 (import wijkt n.v.t. af)
- Teksten (~T) als notities: A 209 items (209 meerregelig), B 209 (209 meerregelig)
- Hoofdstuktotalen met verschil: 0
- Tekenset van de export: ANSI
- Recordtypen origineel: ~C 789, ~D 277, ~K 1, ~M 209, ~T 209, ~V 1, ~X 211
- Recordtypen export: ~C 789, ~D 277, ~M 209, ~T 209, ~V 1
- Waarschuwingen bij import A: geen
- Afwijkingen: geen

### pycost_guadix.bc3

- Schrijver: Iturribizia, S.L.; programma: ppl 0.1; formaat: FIEBDC-3/95; tekenset: (niet opgegeven)
- Grootte: 161.013 bytes, 1.606 regels
- Items A: 2773 (chapter 56, begrotingspost 421, regel 2296); items B: 2773
- Kostprijs A: 1.474.153.917,66; B: 1.474.153.917,66; verschil: 0,00
- Wortelprijs volgens het bestand zelf: 1.474.153.876,25 (import wijkt 0,00 % af)
- Teksten (~T) als notities: A 2720 items (0 meerregelig), B 2720 (0 meerregelig)
- Hoofdstuktotalen met verschil: 0
- Tekenset van de export: ANSI
- Recordtypen origineel: ~C 486, ~D 225, ~M 417, ~T 432, ~V 1, ~Y 44
- Recordtypen export: ~C 397, ~D 227, ~M 421, ~T 343, ~V 1
- Waarschuwingen bij import A: geen
- Afwijkingen: geen

### pycost_measurement_outside_chapter.bc3

- Schrijver: RIB Spain; programma: Pr22.03; formaat: FIEBDC-3/2020; tekenset: ANSI
- Grootte: 17.424 bytes, 226 regels
- Items A: 80 (chapter 5, begrotingspost 12, regel 63); items B: 80
- Kostprijs A: 261.178,14; B: 261.178,14; verschil: 0,00
- Wortelprijs volgens het bestand zelf: 65.324.446,79 (import wijkt -99,60 % af)
- Teksten (~T) als notities: A 53 items (1 meerregelig), B 53 (1 meerregelig)
- Hoofdstuktotalen met verschil: 0
- Tekenset van de export: ANSI
- Recordtypen origineel: ~A 38, ~C 81, ~D 27, ~M 13, ~T 64, ~V 1
- Recordtypen export: ~C 51, ~D 18, ~M 12, ~T 36, ~V 1
- Waarschuwingen bij import A (8):
  - Onbekend concept '02.03.01.01' onder '02.03.01#' — overgesla…
  - Onbekend concept '02.03.01.02' onder '02.03.01#' — overgesla…
  - Onbekend concept '02.03.01.03' onder '02.03.01#' — overgesla…
  - Onbekend concept '02.03.01.04.01' onder '02.03.01.04#' — ove…
  - Onbekend concept '02.03.02' onder '02.03#' — overgeslagen.
  - Onbekend concept '02.03.03' onder '02.03#' — overgeslagen.
- Afwijkingen: geen

### pycost_planta.bc3

- Schrijver: Iturribizia, S.L.; programma: ppl 0.1; formaat: FIEBDC-3/95; tekenset: (niet opgegeven)
- Grootte: 85.242 bytes, 658 regels
- Items A: 351 (chapter 19, begrotingspost 166, regel 166); items B: 351
- Kostprijs A: 119.237.094,99; B: 119.237.094,99; verschil: 0,00
- Wortelprijs volgens het bestand zelf: 119.237.089,04 (import wijkt 0,00 % af)
- Teksten (~T) als notities: A 166 items (1 meerregelig), B 166 (1 meerregelig)
- Hoofdstuktotalen met verschil: 0
- Tekenset van de export: ANSI
- Recordtypen origineel: ~C 170, ~D 151, ~M 166, ~T 149, ~V 1, ~Y 18
- Recordtypen export: ~C 102, ~D 101, ~M 166, ~T 81, ~V 1
- Waarschuwingen bij import A: geen
- Afwijkingen: 2 regel(s), per veld: code 2
  - item #31 code: `2` → `2_1`
  - item #84 code: `4.1` → `4.1_1`

### pycost_pp.bc3

- Schrijver: (leeg); programma: (leeg); formaat: (leeg); tekenset: (niet opgegeven)
- Grootte: 36.317 bytes, 501 regels
- Items A: 1 (chapter 1); items B: 1
- Kostprijs A: 0,00; B: 0,00; verschil: 0,00
- Teksten (~T) als notities: A 0 items (0 meerregelig), B 0 (0 meerregelig)
- Hoofdstuktotalen met verschil: 0
- Tekenset van de export: ANSI
- Recordtypen origineel: ~M 500
- Recordtypen export: ~C 2, ~D 1, ~V 1
- Waarschuwingen bij import A (2):
  - Geen projectstructuur (##/#) gevonden — concepten als prijze…
  - Dit bestand bevat geen prijzen — alleen omschrijvingen en ho…
- Waarschuwingen bij import B (1): Dit bestand bevat geen prijzen — alleen omschrijvingen en ho
- Afwijkingen: geen

### pycost_ref_write_01.bc3

- Schrijver: XC, S.L.; programma: pyCost 0.2; formaat: FIEBDC-3/2020; tekenset: ANSI
- Grootte: 501.540 bytes, 197 regels
- Items A: 114 (chapter 2, begrotingspost 17, regel 95); items B: 114
- Kostprijs A: 1.356.377,94; B: 1.356.377,94; verschil: 0,00
- Wortelprijs volgens het bestand zelf: 1.356.866,66 (import wijkt -0,04 % af)
- Teksten (~T) als notities: A 110 items (0 meerregelig), B 110 (0 meerregelig)
- Hoofdstuktotalen met verschil: 0
- Tekenset van de export: ANSI
- Recordtypen origineel: ~C 78, ~D 26, ~K 1, ~M 17, ~T 73, ~V 1
- Recordtypen export: ~C 64, ~D 20, ~M 17, ~T 60, ~V 1
- Waarschuwingen bij import A: geen
- Afwijkingen: geen

### pycost_sch_base.bc3

- Schrijver: Iturribizia, S.L.; programma: ppl 0.1; formaat: FIEBDC-3/95; tekenset: (niet opgegeven)
- Grootte: 137.708 bytes, 1.526 regels
- Items A: 895 (chapter 41, begrotingspost 427, regel 427); items B: 895
- Kostprijs A: 1.403.378.626,36; B: 1.403.378.626,36; verschil: 0,00
- Wortelprijs volgens het bestand zelf: 1.132.583.228,56 (import wijkt 23,91 % af)
- Teksten (~T) als notities: A 854 items (0 meerregelig), B 854 (0 meerregelig)
- Hoofdstuktotalen met verschil: 0
- Tekenset van de export: ANSI
- Recordtypen origineel: ~C 380, ~D 345, ~M 427, ~T 338, ~V 1, ~Y 34
- Recordtypen export: ~C 380, ~D 379, ~M 427, ~T 338, ~V 1
- Waarschuwingen bij import A (1):
  - Bij 2 partida('s) wijkt de som van de samenstelling meer dan…
- Afwijkingen: geen

### pycost_sispre_murcia5.bc3

- Schrijver: SOFT S.A.; programma: Presto 7.00; formaat: FIEBDC-3/95; tekenset: (niet opgegeven)
- Grootte: 131.075 bytes, 1.681 regels
- Items A: 2155 (chapter 42, begrotingspost 454, regel 1659); items B: 2155
- Kostprijs A: 845.210.719,43; B: 845.210.719,43; verschil: 0,00
- Wortelprijs volgens het bestand zelf: 845.180.002,00 (import wijkt 0,00 % af)
- Teksten (~T) als notities: A 675 items (0 meerregelig), B 675 (0 meerregelig)
- Hoofdstuktotalen met verschil: 0
- Tekenset van de export: ANSI
- Recordtypen origineel: ~C 552, ~D 293, ~M 454, ~T 378, ~V 1
- Recordtypen export: ~C 444, ~D 240, ~M 454, ~T 281, ~V 1
- Waarschuwingen bij import A (1):
  - Bij 1 partida('s) wijkt de som van de samenstelling meer dan…
- Afwijkingen: geen

### pycost_sispre_PUEBLA-EE.bc3

- Schrijver: (leeg); programma: TCQ 2.1; formaat: FIEBDC-3/98; tekenset: ANSI
- Grootte: 37.417 bytes, 458 regels
- Items A: 430 (chapter 32, begrotingspost 82, regel 316); items B: 430
- Kostprijs A: 24.353.970,99; B: 24.353.970,99; verschil: 0,00
- Teksten (~T) als notities: A 322 items (0 meerregelig), B 322 (0 meerregelig)
- Hoofdstuktotalen met verschil: 0
- Tekenset van de export: ANSI
- Recordtypen origineel: ~C 185, ~D 107, ~M 82, ~T 80, ~V 1
- Recordtypen export: ~C 185, ~D 107, ~M 82, ~T 80, ~V 1
- Waarschuwingen bij import A (1):
  - Bij 21 partida('s) wijkt de som van de samenstelling meer da…
- Afwijkingen: geen

### pycost_sispre_puebla-oc.bc3

- Schrijver: (leeg); programma: TCQ 2.1; formaat: FIEBDC-3/98; tekenset: ANSI
- Grootte: 88.373 bytes, 937 regels
- Items A: 1453 (chapter 40, begrotingspost 249, regel 1164); items B: 1453
- Kostprijs A: 32.479.934,34; B: 32.479.934,34; verschil: 0,00
- Teksten (~T) als notities: A 1172 items (0 meerregelig), B 1172 (0 meerregelig)
- Hoofdstuktotalen met verschil: 0
- Tekenset van de export: ANSI
- Recordtypen origineel: ~C 340, ~D 138, ~K 1, ~M 249, ~T 207, ~V 1
- Recordtypen export: ~C 337, ~D 137, ~M 249, ~T 205, ~V 1
- Waarschuwingen bij import A: geen
- Afwijkingen: geen

### pycost_test_file_05.bc3

- Schrijver: CYPE INGENIEROS, S.A.; programma: ARQUIMEDES; formaat: FIEBDC-3/2004; tekenset: ANSI
- Grootte: 151.244 bytes, 2.028 regels
- Items A: 800 (chapter 17, begrotingspost 152, regel 631); items B: 800
- Kostprijs A: 688.131,27; B: 688.131,27; verschil: 0,00
- Wortelprijs volgens het bestand zelf: 697.444,60 (import wijkt -1,34 % af)
- Teksten (~T) als notities: A 481 items (3 meerregelig), B 481 (3 meerregelig)
- Hoofdstuktotalen met verschil: 0
- Tekenset van de export: ANSI
- Recordtypen origineel: ~A 9, ~C 341, ~D 133, ~K 1, ~M 59, ~T 299, ~V 1
- Recordtypen export: ~C 333, ~D 124, ~M 152, ~T 295, ~V 1
- Waarschuwingen bij import A: geen
- Afwijkingen: 5 regel(s), per veld: code 5
  - item #240 code: `DEXZANJAT` → `DEXZANJAT_1`
  - item #251 code: `DEXZANJAT` → `DEXZANJAT_1`
  - item #300 code: `DEXZANJAT` → `DEXZANJAT_1`

### pycost_test_file_06.bc3

- Schrijver: CYPE Ingenieros S.A.; programma: Generador de precios de la construcción. CYPE Ingenieros, S.A.; formaat: FIEBDC-3/2016; tekenset: ANSI
- Grootte: 4.593 bytes, 115 regels
- Items A: 9 (chapter 3, begrotingspost 1, regel 5); items B: 9
- Kostprijs A: 2,14; B: 2,14; verschil: 0,00
- Teksten (~T) als notities: A 6 items (1 meerregelig), B 6 (1 meerregelig)
- Hoofdstuktotalen met verschil: 0
- Tekenset van de export: ANSI
- Recordtypen origineel: ~C 15, ~D 5, ~K 1, ~L 1, ~M 1, ~R 2, ~T 11, ~V 1, ~X 7
- Recordtypen export: ~C 10, ~D 5, ~M 1, ~T 6, ~V 1
- Waarschuwingen bij import A: geen
- Afwijkingen: geen

### pycost_test_file_11.bc3

- Schrijver: TEST; programma: TEST; formaat: FIEBDC-3/2016; tekenset: 850
- Grootte: 7.587 bytes, 98 regels
- Items A: 31 (begrotingspost 5, regel 26); items B: 31
- Kostprijs A: 974,41; B: 974,41; verschil: 0,00
- Wortelprijs volgens het bestand zelf: 390.352,04 (import wijkt -99,75 % af)
- Teksten (~T) als notities: A 10 items (0 meerregelig), B 10 (0 meerregelig)
- Hoofdstuktotalen met verschil: 0
- Tekenset van de export: ANSI
- Recordtypen origineel: ~C 34, ~D 9, ~K 1, ~T 10, ~V 1
- Recordtypen export: ~C 29, ~D 6, ~M 5, ~T 10, ~V 1
- Waarschuwingen bij import A (2):
  - Geen wortelstructuur (##) met samenstelling gevonden — losse…
  - Bij 1 partida('s) wijkt de som van de samenstelling meer dan…
- Afwijkingen: geen

### pycost_test_parametric_02.bc3

- Schrijver: (leeg); programma: pyCost 1.0; formaat: FIEBDC-3/2007; tekenset: utf-8
- Grootte: 5.377 bytes, 121 regels
- Items A: 1 (begrotingspost 1); items B: 1
- Kostprijs A: 0,00; B: 0,00; verschil: 0,00
- Teksten (~T) als notities: A 0 items (0 meerregelig), B 0 (0 meerregelig)
- Hoofdstuktotalen met verschil: 0
- Tekenset van de export: ANSI
- Recordtypen origineel: ~C 26, ~D 1, ~P 1, ~T 2, ~V 1
- Recordtypen export: ~C 2, ~D 1, ~M 1, ~V 1
- Waarschuwingen bij import A (3):
  - Onbekend concept 'AAA020$' onder 'AAA#' — overgeslagen.
  - Onbekend concept 'AAA030$' onder 'AAA#' — overgeslagen.
  - Dit bestand bevat geen prijzen — alleen omschrijvingen en ho…
- Waarschuwingen bij import B (1): Dit bestand bevat geen prijzen — alleen omschrijvingen en ho
- Afwijkingen: geen

### synthetisch-voorbeeld.bc3

- Schrijver: (leeg); programma: Open Calc Studio; formaat: FIEBDC-3/2004; tekenset: ANSI
- Grootte: 483 bytes, 14 regels
- Items A: 5 (chapter 1, begrotingspost 2, regel 2); items B: 5
- Kostprijs A: 119,50; B: 119,50; verschil: 0,00
- Wortelprijs volgens het bestand zelf: 119,50 (import wijkt 0,00 % af)
- Teksten (~T) als notities: A 1 items (0 meerregelig), B 1 (0 meerregelig)
- Hoofdstuktotalen met verschil: 0
- Tekenset van de export: ANSI
- Recordtypen origineel: ~C 6, ~D 3, ~M 2, ~T 1, ~V 1
- Recordtypen export: ~C 6, ~D 3, ~M 2, ~T 1, ~V 1
- Waarschuwingen bij import A: geen
- Afwijkingen: geen

### tocbim_FirstStreet_corridor_PRES.bc3

- Schrijver: (leeg); programma: IFC2BC3_Claude; formaat: FIEBDC-3/2012; tekenset: ANSI
- Grootte: 6.822 bytes, 50 regels
- Items A: 15 (chapter 5, begrotingspost 10); items B: 15
- Kostprijs A: 162.087,66; B: 162.087,66; verschil: 0,00
- Wortelprijs volgens het bestand zelf: 162.087,65 (import wijkt 0,00 % af)
- Teksten (~T) als notities: A 15 items (0 meerregelig), B 15 (0 meerregelig)
- Hoofdstuktotalen met verschil: 0
- Tekenset van de export: ANSI
- Recordtypen origineel: ~C 16, ~D 6, ~K 1, ~M 10, ~T 15, ~V 1
- Recordtypen export: ~C 16, ~D 6, ~M 10, ~T 15, ~V 1
- Waarschuwingen bij import A: geen
- Afwijkingen: geen

### tocbim_MVC-Brises.bc3

- Schrijver: RIB Spain; programma: Presto 25.00; formaat: FIEBDC-3/2020; tekenset: ANSI
- Grootte: 522.978 bytes, 3.975 regels
- Items A: 575 (chapter 166, begrotingspost 409); items B: 575
- Kostprijs A: 0,00; B: 0,00; verschil: 0,00
- Wortelprijs volgens het bestand zelf: 0,00 (import wijkt n.v.t. af)
- Teksten (~T) als notities: A 409 items (353 meerregelig), B 409 (353 meerregelig)
- Hoofdstuktotalen met verschil: 0
- Tekenset van de export: ANSI
- Recordtypen origineel: ~C 481, ~D 158, ~G 1, ~K 1, ~L 1, ~M 206, ~T 313, ~V 1, ~X 6
- Recordtypen export: ~C 471, ~D 157, ~M 409, ~T 304, ~V 1
- Waarschuwingen bij import A (1):
  - Dit bestand bevat geen prijzen — alleen omschrijvingen en ho…
- Waarschuwingen bij import B (1): Dit bestand bevat geen prijzen — alleen omschrijvingen en ho
- Afwijkingen: geen

<!-- gegenereerd:einde -->

## Wat gaat er verloren of komt erbij

De rondreis vergelijkt de begroting *in Open Calc Studio* vóór en na de
export (A tegenover B). Daarnaast is gekeken naar het verschil tussen het
originele bestand en ons exportbestand (recordtypen tellen, exportercode
lezen). Dat zijn twee verschillende vragen.

### Verloren bij het inlezen (staat niet in het OCS-model)

- **Meetregels (~M, veld 4).** De detailregels van een meetstaat —
  opmerking, aantal × lengte × breedte × hoogte, formules, deelsommen —
  worden opgeteld tot één hoeveelheid per post. Alleen het totaal blijft.
  In 19 van de 22 bestanden staan zulke regels (bv. `fjht_vua1`: 56
  posten, `pycost_sch_base`: alle 427). Het totaal klopt, de opbouw is weg.
- **Samenstelling van hulpprijzen.** Een samengesteld concept dat in de
  samenstelling van een partida wordt gebruikt (BCCA: 4.301 keer; ook
  Arquímedes en TCQ) wordt één rekenregel met de prijs van dat concept. De
  onderliggende arbeid/materialen van die hulpprijs gaan niet mee; het
  bedrag wel.
- **Factor en rendement apart.** `~D` heeft factor × rendement; wij bewaren
  het product als norm. Het bedrag is gelijk, de splitsing is weg.
- **Prijsdatum (~C veld 5) en meerdere prijskolommen.** De importer neemt
  de eerste prijs; datum en overige prijzen (bv. per provincie in Presto
  22-bestanden) vervallen. `pycost_measurement_outside_chapter` heeft één
  concept met twee prijzen.
- **Concepttype 0/4/5.** Type 1/2/3 wordt arbeid/materieel/materiaal;
  alles anders (0 = leeg, 4/5 = gereedschappen/aanvullend) wordt
  materiaal. Bij export komt daar dus `3` te staan waar `0` stond.
- **Aliascodes** (`~C|CODE\ALIAS|`): alleen de eerste code blijft
  (`tocbim_MVC-Brises`: 1 geval).
- **Eenheden buiten ons eenhedenmodel.** `ud`, `h`, `m3`, `t`, `tn`, `hr`,
  `mes`, `pa` e.d. worden vertaald; wat niet past (`l`, `mu`, `x`, `***`)
  wordt `st`. Na de rondreis staat er dus `st` waar `l` stond. Bedragen
  raakt dit niet.
- **Regeleinden in korte omschrijvingen** worden een spatie
  (`pycost_planta`, één geval).
- **Overige records** worden genegeerd: `~K` (decimalen en valuta), `~L`
  en `~X` (vrije velden, CO₂ e.d.), `~A` (attributen), `~G` (afbeeldingen),
  `~R` (rubrieken), `~P` (parametrische concepten — `pycost_test_parametric_02`
  levert daardoor maar één post op), `~E`, `~O`, `~W`.
- **Staart/opslagen op projectniveau** kent BC3 niet; die zitten in Spaanse
  begrotingen als `%`-regels per partida en komen als zodanig mee.

### Verloren bij het wegschrijven (staat wel in OCS, niet in het bestand)

- Staartregels (`staart_*`), tekst- en witregels: BC3 heeft er geen plek
  voor. Een uit BC3 geïmporteerde begroting heeft ze niet, dus voor de
  rondreis speelt dit niet.
- De wortelcode van het origineel (`PR##`, `BCCA_2023_v02##`) wordt
  `OCS##`; de projectnaam en -omschrijving (uit `~T` op de wortel) blijven.
- Codes die twee keer voorkomen voor verschillende inhoud krijgen een
  `_n`-suffix. Dat gebeurt (1) bij hoofdstukken met dezelfde code
  (`pycost_planta`: `2` en `4.1`, een eigenaardigheid van het origineel) en
  (2) bij hulpprijzen waarvan het origineel de op 2 decimalen afgeronde
  ~C-prijs gebruikt in de samenstelling terwijl de eigen samenstelling
  meer decimalen oplevert (BCCA: 2.024 regels, `pycost_test_file_05`:
  `DEXZANJAT` 3,06 tegenover 3,054465). In beide gevallen zijn de bedragen
  na de rondreis gelijk.

### Wat erbij komt

- Onze `~V`-kop (`FIEBDC-3/2004`, `Open Calc Studio`, tekenset `ANSI`;
  `UTF-8` als de tekst niet in Windows-1252 past).
- Eenheden in onze schrijfwijze (`uur`, `m²`, `st`) in plaats van `h`,
  `m2`, `ud`.
- Een positiepad in elk `~M`-record en een `~M` per post (ook waar het
  origineel geen metingen had, zoals BCCA: 11.802 stuks met hoeveelheid 1).
- Type `3` op middelen die in het origineel type `0` hadden.
- `%`-concepten krijgen prijs 0 en eenheid `%`; de fractie staat in `~D`.
  Sommige schrijvers zetten het percentage zelf als prijs (6, 3); dat gaat
  verloren maar wordt nergens voor gebruikt.

### Wat behouden blijft

Structuur en volgorde (hoofdstukken op elke diepte, posten, rekenregels),
codes, omschrijvingen, eenheden, hoeveelheden met alle decimalen,
rendementen met alle decimalen, prijzen, `%`-opslagen, hoofdstuktotalen,
kostprijs, de lange teksten (`~T`) inclusief regeleinden, projectnaam en
-omschrijving, tekens buiten ASCII.

## Bugs gevonden en gerepareerd tijdens deze test

1. **Afronding op 3 decimalen** in de exporter (rendementen, prijzen,
   hoeveelheden). Echte bestanden hebben 4–15 decimalen; bij totalen in
   de miljoenen (`pycost_guadix`, `pycost_sch_base`) verschoof de kostprijs
   met tientallen euro's. Nu: kortste exacte schrijfwijze, geen
   exponentnotatie.
2. **Regeleinden in ~T-teksten** werden spaties (BCCA: 91 teksten,
   `tocbim_MVC-Brises`: 259, `fjht_vua1`: 209). Nu blijven ze staan (CRLF
   in het bestand, LF in de notities).
3. **Elk voorkomen van een middel werd een eigen concept** (`MO001`,
   `MO001_1`, … tot honderden keren). Nu delen inhoudelijk gelijke
   rekenregels en posten één `~C`; BCCA gaat van 46.215 naar 15.740
   `~C`-records (origineel 15.514).
4. **Dezelfde partida twee keer in één hoofdstuk** kreeg bij herimport de
   som van beide metingen, omdat de exporter geen positiepad in `~M`
   schreef. Nu wel.
5. **Rendement 0 in een samenstelling** (BCCA, Arquímedes, ppl, pyCost)
   werd bij import "directe prijs" (aantal × prijs) en telde geld op dat
   niet in het bestand staat. Nu krijgt zo'n regel aantal 0. Hetzelfde
   voor een `%`-regel met 0 %.
6. **Opslagregels verloren hun markering** na export (eenheid `post`), zodat
   ze bij herimport als gewoon middel werden gelezen; bedragen bleven
   gelijk, het type niet. Nu eenheid `%` bij import en export.
7. **Prijs van een post zonder hoeveelheid** werd 0 (totaal ÷ hoeveelheid).
   Nu de eenheidsprijs zelf.
8. **Tekenset.** Buiten de browser (Node, jsdom) valt
   `TextDecoder('windows-1252')` stil terug op ISO-8859-1, waardoor €, “ ”
   en – als stuurtekens binnenkwamen. Eigen Windows-1252-tabel voor
   lezen en schrijven; dubbel gecodeerde stuurtekens (Arquímedes) worden
   hersteld; tekst die niet in Windows-1252 past gaat als UTF-8 de deur
   uit.
9. **Bewakingsposten onder een post** stonden niet in de `~D` van de post,
   zodat hun bedrag voor een lezer verdween; rekenregels zonder norm
   (direct-model) kregen rendement 0. Beide gerepareerd (alleen voor
   OCS-eigen begrotingen van belang).
10. **Spaties in codes** werden verwijderd (`AJUSTE PPTO` → `AJUSTEPPTO`);
    Presto 8 én 22 schrijven ze. Nu blijven ze staan.
11. **Projectomschrijving** (`~T` op de wortel) werd niet weggeschreven.
12. **Regeleinde in een korte omschrijving** en enkele eenheden (`t`,
    `tn`, `hr`, `ud.`) in de importer.

## Bewust niet gerepareerd

- Meetregels en de samenstelling van hulpprijzen: het OCS-model heeft er
  geen plek voor; dat is een datamodelbeslissing, geen bug.
- Hoofdstukken met dezelfde code blijven twee concepten met suffix; het
  origineel is daar zelf niet conform.
- De op 2 decimalen afgeronde hulpprijzen in BCCA/Arquímedes: wij rekenen
  bottom-up (zoals de importer altijd doet); het suffix is het gevolg.
- Interne inconsistenties van de bronbestanden (`pycost_sch_base` +23,9 %,
  `corsam_presupuesto` +197 % t.o.v. de eigen wortelprijs) — zie README.
- De importer maakt geen tekstregels van `~T`-teksten en geen
  onderaannemer-/overig-typen; niet nodig voor de rondreis.

## Eindoordeel

1. Voor een gewone begroting is de rondreis **verliesvrij qua bedragen**:
   in alle 22 bestanden zijn kostprijs, hoofdstuktotalen en elk regelbedrag
   na herimport gelijk (± 0,01), inclusief de drie bestanden met totalen
   boven een miljard.
2. **Omschrijvingen, eenheden, hoeveelheden, hiërarchie en lange teksten**
   komen ongewijzigd terug; 19 van de 22 bestanden zijn veld voor veld
   identiek.
3. In 3 bestanden verandert alleen een **code** door een `_n`-suffix
   (dubbele hoofdstukcodes, afgeronde hulpprijzen); het geld erachter
   niet.
4. Ten opzichte van het **originele bestand** gaan meetregels, de
   samenstelling van hulpprijzen, prijsdatums, extra prijskolommen en
   metadata-records (`~K`, `~L`, `~X`, `~A`, `~G`, `~P`) verloren; het
   exportbestand is een correcte maar kalere BC3.
5. Wat erbij komt is cosmetisch: onze kop, onze eenheidsnamen, een `~M`
   per post en type 3 op middelen zonder type.
