# FIEBDC-3 (.bc3) — verificatiebestanden

Echte praktijkbestanden in het Spaanse uitwisselformaat FIEBDC-3, verzameld
van openbare bronnen (geen login of registratie), plus één synthetisch
voorbeeld. Ze dienen als invoer voor de rondreistest
`src/test/bc3Roundtrip.test.ts` (importeren → exporteren → opnieuw
importeren → vergelijken); het resultaat staat in [RAPPORT.md](RAPPORT.md).

De test slaat deze map over als hij ontbreekt, zodat CI niet breekt.

## Bestanden

Programma en formaatversie komen uit het `~V`-record van het bestand zelf
(veld 3 en 2); de tekenset uit veld 5. "Regels" is het aantal tekstregels
(CRLF); de meeste records staan op één regel, `~T`-teksten lopen door.

| Bestand | Bron | Programma (uit ~V) | Formaat | Tekenset | Regels | Bytes |
| --- | --- | --- | --- | --- | ---: | ---: |
| `BCCA2023_V02.bc3` | Junta de Andalucía, Base de Costes de la Construcción de Andalucía 2023 — https://www.juntadeandalucia.es/sites/default/files/inline-files/2024/01/BCCA2023_V02.zip | Presto 22.01 | FIEBDC-3/2020 | ANSI | 35.920 | 4.376.644 |
| `corsam_presupuesto.bc3` | https://raw.githubusercontent.com/carlosmorenolosa/frontend_corsam/main/presupuesto.bc3 | Presto 8.8 | FIEBDC-3/2002 | ANSI (inhoud is dubbel gecodeerde UTF-8, zie hieronder) | 546 | 80.557 |
| `fjht_018-12.bc3` | https://raw.githubusercontent.com/fjht/bc3/master/018-12.bc3 | Presto 11.02 | FIEBDC-3/2002 | ANSI | 623 | 71.144 |
| `fjht_018-12_con_resumen.bc3` | https://raw.githubusercontent.com/fjht/bc3/master/018-12_con_resumen.bc3 | ARPO-BC3 | FIEBDC-3/2002 | ANSI | 623 | 72.938 |
| `fjht_prueba.bc3` | https://raw.githubusercontent.com/fjht/bc3/master/prueba.bc3 | Presto 11.02 | FIEBDC-3/2002 | ANSI | 16 | 442 |
| `fjht_vua1.bc3` | https://raw.githubusercontent.com/fjht/bc3/master/vua1.bc3 | CYPE, Predimensionador para viviendas unifamiliares aisladas | FIEBDC-3/2002 | ANSI | 4.132 | 385.812 |
| `pycost_guadix.bc3` | https://raw.githubusercontent.com/xc-structural-engineering/pyCost/master/old/ejemplos/guadix.bc3 | Iturribizia ppl 0.1 | FIEBDC-3/95 | (niet opgegeven; DOS/CP850) | 1.606 | 161.013 |
| `pycost_measurement_outside_chapter.bc3` | https://raw.githubusercontent.com/xc-structural-engineering/pyCost/master/verif/tests/data/bc3/measurement_outside_chapter.bc3 | Presto 22.03 | FIEBDC-3/2020 | ANSI (inhoud is UTF-8) | 226 | 17.424 |
| `pycost_planta.bc3` | https://raw.githubusercontent.com/xc-structural-engineering/pyCost/master/old/test/planta/planta.bc3 | Iturribizia ppl 0.1 | FIEBDC-3/95 | (niet opgegeven; DOS/CP850) | 658 | 85.242 |
| `pycost_pp.bc3` | https://raw.githubusercontent.com/xc-structural-engineering/pyCost/master/old/ejemplos/pp.bc3 | — (fragment met alleen ~M-records, geen ~V) | — | — | 501 | 36.317 |
| `pycost_ref_write_01.bc3` | https://raw.githubusercontent.com/xc-structural-engineering/pyCost/master/verif/tests/data/bc3/ref_test_write_bc3_01.bc3 | pyCost 0.2 | FIEBDC-3/2020 | ANSI | 197 | 501.540 |
| `pycost_sch_base.bc3` | https://raw.githubusercontent.com/xc-structural-engineering/pyCost/master/old/ejemplos/sahechores/sch_base.bc3 | Iturribizia ppl 0.1 | FIEBDC-3/95 | (niet opgegeven; DOS/CP850) | 1.526 | 137.708 |
| `pycost_sispre_PUEBLA-EE.bc3` | https://raw.githubusercontent.com/xc-structural-engineering/pyCost/master/old/ejemplos/sispre/auding/PUEBLA-EE.BC3 | TCQ 2.1 | FIEBDC-3/98 | ANSI | 458 | 37.417 |
| `pycost_sispre_murcia5.bc3` | https://raw.githubusercontent.com/xc-structural-engineering/pyCost/master/old/ejemplos/sispre/murcia5.bc3 | Presto 7.00 | FIEBDC-3/95 | (niet opgegeven; DOS/CP850) | 1.681 | 131.075 |
| `pycost_sispre_puebla-oc.bc3` | https://raw.githubusercontent.com/xc-structural-engineering/pyCost/master/old/ejemplos/sispre/auding/puebla-oc.BC3 | TCQ 2.1 | FIEBDC-3/98 | ANSI | 937 | 88.373 |
| `pycost_test_file_05.bc3` | https://raw.githubusercontent.com/xc-structural-engineering/pyCost/master/verif/tests/data/bc3/test_file_05.bc3 | Arquímedes (CYPE) | FIEBDC-3/2004 | ANSI (inhoud is UTF-8 met dubbel gecodeerde aanhalingstekens) | 2.028 | 151.244 |
| `pycost_test_file_06.bc3` | https://raw.githubusercontent.com/xc-structural-engineering/pyCost/master/verif/tests/data/bc3/test_file_06.bc3 | CYPE, Generador de precios de la construcción | FIEBDC-3/2016 | ANSI (inhoud is UTF-8) | 115 | 4.593 |
| `pycost_test_file_11.bc3` | https://raw.githubusercontent.com/xc-structural-engineering/pyCost/master/verif/tests/data/bc3/test_file_11.bc3 | TEST | FIEBDC-3/2016 | 850 | 98 | 7.587 |
| `pycost_test_parametric_02.bc3` | https://raw.githubusercontent.com/xc-structural-engineering/pyCost/master/verif/tests/data/bc3/test_parametric_02.bc3 | pyCost 1.0 | FIEBDC-3/2007 | utf-8 | 121 | 5.377 |
| `tocbim_FirstStreet_corridor_PRES.bc3` | https://raw.githubusercontent.com/JardiMargalefAgusti/TOC-BIM-Viewer/master/app-mcp/public/test/FirstStreet_corridor_PRES.bc3 | IFC2BC3_Claude | FIEBDC-3/2012 | ANSI | 50 | 6.822 |
| `tocbim_MVC-Brises.bc3` | https://raw.githubusercontent.com/JardiMargalefAgusti/TOC-BIM-Viewer/master/app-mcp/public/test/MVC-Brises.bc3 | Presto 25.00 | FIEBDC-3/2020 | ANSI (inhoud is UTF-8) | 3.975 | 522.978 |
| `synthetisch-voorbeeld.bc3` | eigen minimaal voorbeeld (wortel, hoofdstuk, twee partida's, arbeid + materiaal, ~M en ~T) | Open Calc Studio | FIEBDC-3/2004 | ANSI | 14 | 481 |

Alle bestanden zijn kleiner dan 5 MB en staan hier als kopie; de BCCA
(4,4 MB, 46.215 regels na import) is de grootste. De zip van de Junta de
Andalucía bevat naast de .bc3 nog documentatie; alleen de .bc3 is
overgenomen.

## Wat de bestanden bijzonder maakt

- **Tekenset klopt vaak niet met de kop.** Presto 22/25 en Arquímedes
  schrijven UTF-8 met "ANSI" in het `~V`-record; FIEBDC-3/95 noemt geen
  tekenset en is DOS (CP850); `corsam_presupuesto.bc3` bevat tekst die
  twee keer is gecodeerd (ISO-8859-1 gelezen, als UTF-8 weggeschreven).
  De importer beslist op de bytes zelf, niet op de declaratie.
- **Dubbele codes.** `pycost_planta.bc3` gebruikt hoofdstukcode `4.1` twee
  keer voor twee verschillende hoofdstukken (alleen de volgorde in de
  decompositie onderscheidt ze). `pycost_test_file_05.bc3` heeft naast
  `DEXZANJAT` ook `DEXZANJAT-1`.
- **Hulpprijzen als middel.** BCCA (4.301 keer), Arquímedes en TCQ zetten
  samengestelde concepten ("precios auxiliares") in de samenstelling van
  een partida. Bij ons wordt dat een rekenregel met de prijs van het
  hulpconcept; de onderliggende samenstelling gaat in het OCS-model niet mee.
- **Rendement 0.** BCCA (7 partida's), Arquímedes (2), ppl (1) en pyCost
  (1) hebben samenstellingsregels met rendement 0 naast gewone regels;
  `corsam_presupuesto.bc3` heeft alléén rendement 0 (dan telt de
  ~C-prijs).
- **Veel decimalen.** ppl schrijft rendementen met 15 decimalen
  (float-ruis zoals `0.004999999888241`), TCQ ook; `~M`-totalen hebben tot
  5 decimalen. Bij totalen van honderden miljoenen (`pycost_sch_base`,
  `pycost_planta`, `pycost_guadix`) telt elke decimaal.
- **Procentregels.** `%`-codes zijn meestal opslagen over de voorgaande
  regels (`%CI`, `%003`, `IS13` met eenheid `%`), maar `pycost_guadix.bc3`
  gebruikt `%7` als gewoon middel (rendement × prijs). De importer stemt
  per concept op de lezing die de partida-prijzen reproduceert.
- **Geen prijzen.** `tocbim_MVC-Brises.bc3` en `pycost_test_parametric_02.bc3`
  zijn meetstaat-/parameterbibliotheken zonder prijzen;
  `pycost_pp.bc3` bevat alleen `~M`-records.
- **Interne inconsistenties in de bron** (geen importerfout):
  `pycost_sch_base.bc3` heeft partida's `1201`/`1205` met ~C-prijs 1 terwijl
  hun samenstelling 134 resp. 136 miljoen zegt; `corsam_presupuesto.bc3`
  heeft hoofdstukprijzen die niet uit de partida's volgen;
  `pycost_test_file_05.bc3` en BCCA gebruiken voor hulpprijzen de op 2
  decimalen afgeronde ~C-prijs terwijl de samenstelling meer decimalen
  oplevert (`DEXZANJAT`: 3,06 tegenover 3,054465).

## Toetsing van de import

Controle: de prijs op het wortelconcept (`~C` met `##`) is het
projecttotaal. De kolom "Afwijking import t.o.v. bestand" in RAPPORT.md
vergelijkt de bottom-up berekende kostprijs daarmee. Bestanden waarvan de
wortelprijs 0 is of bij een groter project hoort (fragmenten,
prijzenboeken) zijn daar als "n.v.t." gemarkeerd.

## Specificatie

https://www.fiebdc.es/format-fiebdc/ (FIEBDC-3/2024 en /2020, ook in het
Engels). FIEBDC biedt ook een gratis validator ("BC3 Checker").
