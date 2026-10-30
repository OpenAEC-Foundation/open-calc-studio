# DynLex-verkenning en meetplan (#15)

Dit is een eerste inventarisatie en reproduceerbare **huidige** rekenbaseline,
geen gerealiseerde herschrijving of snelheidsclaim. De
[DynLex README](https://github.com/OpenAEC-Foundation/dynlex/blob/master/README.md),
gelezen op 26 oktober 2026, beschrijft native LLVM-codegeneratie, een
`--emit-object --no-main` C-ABI-librarygrens en een browsercompiler op basis van
Emscripten. Het bouwen van een browsercompiler bewijst nog niet dat alle
desktop-UI-, opslag- en integratiefuncties naar de browser kunnen worden overgezet.

De toolchain vereist C++23, bootstrap-Clang 20+, CMake, Ninja en een gepinde
LLVM 23-fork; web vereist daarnaast Emscripten. Een gewone systeem-LLVM is
volgens de upstreaminstructie onvoldoende. Deze compiler is hier niet gebouwd.
Een representatief DynLex-prototype en vergelijking blijven open.

| Bestaand oppervlak | Te bewijzen bij migratie |
| --- | --- |
| Pure rekenkern, normen, tarieven, staart, gemengde btw | Exact dezelfde bedragen, sorteervolgorde en input-onveranderlijkheid |
| Grid, undo, selectie, wizard en mobiel | Bewerkbare kostenopbouw, focus/toetsenbord en voldoende snelle grote projecten |
| .ifcCalc, snapshots, deelbladen, offerte en PDF-data | Geteste migratie zonder inhoudsverlies; bestandsversie los van productversie |
| BC3, ÖNORM, GAEB, CUF, MDB, SQLite, Excel, IFC | Beschikbare libraries/FFI, foutmeldingen en golden roundtrips |
| Rapportage, Typst, print en lettertypen | Zelfde hoeveelheden/bedragen en onafhankelijke visuele vergelijking |
| Tauri, native ABI, MCP en API | Thread-/buffercontract, compatibele tools en externe clients |
| SuperCloud/opaque iframe en embed | Geen eigen auth/netwerk, versieconflicten, opslag zonder same-origin |

## Uitvoerbare baseline en prototypecontract

```sh
npm ci
npm run build:lib
node scripts/benchmark-core.mjs /tmp/ocs-core-baseline.json
```

Het script meet de echte voorbeeldbegroting en een variant met gewijzigde
hoeveelheid/eenheidsprijs, met warm-up en 100 iteraties. Het legt fixturehash,
runtime, CPU, mediane/p95-rekentijd, Node-RSS en aanwezige ongecomprimeerde
buildmappen vast. `dynlex-baseline.json` bevat de lokale waarneming. Buildmappen
meten omvatten voorbeelden en assets en zijn geen downloadgroottes. Node-RSS
is geen desktopgeheugenmeting. Opstarttijd, UI-interactie en een grote
begroting zijn nog niet gemeten; de kleine fixture alleen kan geen besluit
over een volledige migratie dragen.

Het eerste DynLex-prototype moet dezelfde fixture inlezen, een hoeveelheid en
prijs kunnen bewerken en volledige rekenoutput teruggeven. Vergelijk elk
regelbedrag én alle staarttotalen met de huidige kern, inclusief tarief- en
gemengde-btw-varianten uit de MCP-pariteitstest. Pas daarna wordt een
native/WASM-module in een bewerkbaar prototypescherm geplaatst.

## Fasering en beslismomenten

### Uitgevoerd native mini-prototype — 30 oktober 2026

`research/dynlex/cost-line.dl` compileert met de bestaande DynLex-release 0.0.1.
De Linux-tarball is gecontroleerd tegen de gepubliceerde `SHA256SUMS`:
`922d6b0ba714a8d152a7ee30f22f4edc92d176cb3f3d1aeb00b3d6e2efe5a5f8`.
Het programma leest hoeveelheid, uren per eenheid, uurloon, materiaalprijs,
opslag en btw via stdin. De invoer kan zonder hercompilatie worden aangepast.
`scripts/check-dynlex-prototype.mjs` vergelijkt vijf gevallen met de huidige
SDK-rekenkern, inclusief nulwaarden en gewijzigde hoeveelheden/prijzen.
De verschillen blijven binnen een halve cent. Het meetresultaat staat in
`dynlex-prototype.json`.

```sh
DYNLEX_COMPILER=/path/to/dynlex/bin/dynlex \
DYNLEX_LIBRARY=/path/to/dynlex/share/dynlex \
node scripts/check-dynlex-prototype.mjs result.json
```

Dit is extra haalbaarheidsbewijs voor een enkele kostenregel met opslag/btw.
Het is geen volledige begrotingsimport, genest rekenmodel, gemengde btw,
bewerkbare grafische UI of DLL. De compiler van de huidige master is niet
gebouwd. Processtarttijd en de grootte van dit kleine programma mogen niet
met de gehele app of een warme JavaScript-berekening worden vergeleken.
Issue #15 blijft daarom open voor de overige fasen en het go/no-go-besluit.

1. Pin een bouwbare DynLex-toolchain en leg compiler-/stdliblicenties vast.
2. Bouw het beschreven rekenprototype en laat alle rekenregressies slagen.
3. Meet koud opstarten, p50/p95-bewerken op 1k/10k/50k regels, RSS en complete
   gecomprimeerde distributies op dezelfde hardware en OS. Leg sampleaantal,
   compilerflags en meetmethode vast; vergelijk met dezelfde huidige UI.
4. Go/no-go: nul inhoudelijke regressies en nul metadata-/bestandsverlies.
   Voorlopige prestatiedoelen voor de proef zijn minimaal 25% lagere p95 bij
   grote calculaties en 25% kleinere complete distributie zonder UI-regressie;
   dit zijn doelen, geen aangetoonde resultaten. Bepaal ook of de investering
   opweegt tegen verbetering van de huidige kern.
5. Bij go: eerst pure rekenkern achter het bestaande contract, daarna
   import/export en rapportage, vervolgens UI en native/hostintegraties. Houd
   beide implementaties vergelijkbaar tot functionele gelijkwaardigheid is
   bewezen. Geen automatische omzetting van bestaande gebruikersbestanden.

Issue #15 blijft open tot het prototype, de ontbrekende metingen en de
haalbaarheidsbeslissing zijn vastgelegd.
