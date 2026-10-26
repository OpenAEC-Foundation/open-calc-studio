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
