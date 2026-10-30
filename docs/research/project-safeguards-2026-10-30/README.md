# Herstel prijsbronnen revisies en importbeveiliging

Implementatie voor ontwikkelversie **2026.44.6**, met optionele bronvelden in
bestandsformaat **2.4.0**. Dit is de uitvoering van de zeven vervolgstappen uit
het [onderzoek](../first-four-readiness-2026-10-30/README.md).

## Opgeleverde functies

| Stap | Resultaat | Controle |
| --- | --- | --- |
| 1 Herstel | Transactioneel IndexedDB-journal per venster met alle tabbladen en snapshots; zichtbare foutmelding; herstel als nieuwe bestanden; native tijdelijke schrijfcyclus en `.bak`; bescherming van edits tijdens opslaan en sluiten | Herstel-/quota-/corruptieproeven, drie tests voor sluiten, Rust-bestandsproef |
| 2 Veilige import | Officiële SheetJS 0.20.3 vastgelegd in `vendor`; PDF.js 6.4.299; ongebruikte ThatOpen-keten verwijderd; XML-keten van MDB en MCP bijgewerkt; workbook-/ZIP-/celgrenzen en UI-worker met 30-secondenlimiet | Productie-audits, conversie-/BasCalc-regressies, dimension-/ZIP-/deadlineproeven |
| 3 Prijsherkomst | Vaste catalogus-/artikel-ID's, toegepaste prijs met bron/peildatum/versie/valuta op de regel, herkomstkaart in de eigenschappen en gebruikte artikelen in projectopslag | Herschikken, aparte catalogi, save/open, eigen prijs en eenheid/valuta |
| 4 Revisiecontrole | PDF-bronhashcontrole, expliciete toestemming en zichtbare melding voor exports zonder hash; IFC-vergelijking op unieke GlobalIds en exacte hoeveelheden; selectief herkoppelen en undo | Echte IFC-fixture met hernummering en hoeveelheidswijziging, dubbele GlobalIds, verkeerde PDF-hash |
| 5 Prijsupdates | Preview met oude/nieuwe prijzen en hoofdstuk-/totaaleffect; expliciete regelselectie; één undoactie; stale-inputcontrole en behoud van normen/hoeveelheden/eigen prijzen/inactieve variantregels | Pure functies, MCP-acties en dialoogbediening via React |
| 6 Grote projecten | Herhaalbare metingen met 1.000/10.000/50.000 rekenregels, 1.000/5.000 IFC-objecten en 1/10/30 MiB ingebedde PDF-bytes | Drie runs per meting, analytische budgettotalen en objectaantallen gecontroleerd |
| 7 Documentatie | README, NL/EN-handleiding, releasenotes, bestandsformaat en dit bewijs; pure functies geëxporteerd via `core`; nieuwe desktopacties beschikbaar in de MCP-catalogus | Typecontrole, library/framebuild en inhoudscontrole |

## Vindplaatsen in de app

Open **Controlecentrum** en kies **Prijsupdates beoordelen** of
**Bronrevisies vergelijken**. Op mobiel bereik je dit via **Controle**. Ook de
middelenkiezer heeft een knop naar prijsupdates. Prijsherkomst staat bij de
regeleigenschappen. Herstelstatus en beschikbare journals verschijnen bovenaan.
De dialogen ondersteunen toetsenbordfocus en Escape; tabellen beginnen met
100 regels en bieden meer regels op aanvraag.

De prijsupdatepreview toont het effect van alle passende veranderingen. Alleen
expliciet aangevinkte regels worden toegepast. Ontbrekende bronidentiteiten of
onverenigbare eenheden/valuta leiden niet tot een geschatte koppeling.

## Validatie

De volledige suite slaagt met **888 tests en 6 overgeslagen tests**. De
platformsuite slaagt met zes tests; de headless API met negen tests. Daarnaast
slagen de zelfstandige MCP-reken-/uitwisselings-/HTTP-proeven en de Rust-proef
voor native bestandsvervanging. TypeScript, webbuild en library/framebuild zijn
gecontroleerd. De lokale native devbuild en zijn integratiebewijs staan bij de
lokale buildartefacten; zij zijn geen gepubliceerde, ondertekende release.

[App-productieaudit](production-audit.json) en
[MCP-productieaudit](mcp-production-audit.json) melden beide nul kwetsbare
productiepakketten op dit controlemoment. Dit zegt niets over toekomstige
meldingen of alle ontwikkelafhankelijkheden.

De officiële SheetJS-tarball heeft SHA-256
`8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8`.
De SDK bundelt deze implementatie, zodat het npm-pakket geen afhankelijkheid
heeft van een intern `file:vendor/...`-pad. Licentie-/distributienotices worden
met de normale build meegenomen.

Bronnen voor de updates:
[SheetJS-installatie](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/),
[SheetJS CVE-2023-30533](https://cdn.sheetjs.com/advisories/CVE-2023-30533),
[SheetJS CVE-2024-22363](https://cdn.sheetjs.com/advisories/CVE-2024-22363),
[Mozilla PDF.js](https://github.com/mozilla/pdf.js/security/advisories/GHSA-hq66-cqwq-w95j).

## Schaalmetingen

| Bewerking | Rekenregels | Mediaan van drie runs | Grootste gemeten RSS-toename |
| --- | ---: | ---: | ---: |
| budget-recalculate | 1000 | 4.5 ms | 0.6 MiB |
| project-save-open | 1000 | 11.8 ms | 1 MiB |
| price-preview | 1000 | 12.7 ms | 0.1 MiB |
| budget-recalculate | 10000 | 29.3 ms | 6.1 MiB |
| project-save-open | 10000 | 161.1 ms | 35.4 MiB |
| price-preview | 10000 | 131.7 ms | 29.4 MiB |
| budget-recalculate | 50000 | 138.1 ms | 12.4 MiB |
| project-save-open | 50000 | 723.6 ms | 54.7 MiB |
| price-preview | 50000 | 851.4 ms | 87.8 MiB |

De volledige meetreeks, runtimes, hardware en beperkingen staan in
[performance.json](performance.json). De meting gebruikt Node op deze Linux-host
met een AMD Ryzen 7 3700U en circa 14 GiB geheugen. RSS-toename is geen piekmeting.
Een UI-preview met 50.000 regels kan op basis van deze meting merkbaar wachten
geven; er is geen prestatiewinst ten opzichte van de vorige versie aangetoond.

De IFC-proef parseert echte gegenereerde STEP-data en vergelijkt opgeslagen
identiteit/hoeveelheden. Zij meet geen GPU-meshweergave. De PDF-proef meet het
opslaan/heropenen van ingebedde bytes, geen renderkwaliteit of paginawisseling.
Deze cijfers zijn geen telefoon- of cloudcapaciteitsgarantie.

## Grenzen en resterende praktijktests

- Herstel is aanvullend op expliciet opslaan en backups. Een geweigerde of volle
  opslag geeft een fout. Het browserbeleid kan opgeslagen gegevens verwijderen;
  de laatste edits kunnen buiten het laatste checkpoint vallen.
- IFC-geometrie wordt niet als meshjournal bewaard. Na herstart blijft de
  uittrekstaat beschikbaar en vraagt de 3D-weergave het juiste bronbestand.
- IFC-revisievergelijking gaat over identiteit en hoeveelheden. Geometriewijzigingen
  zonder aangepaste hoeveelheden vragen controle in de viewer. PDF-metingen
  worden vergeleken; automatische geometrische overlays of herplaatsing van
  meetpunten zijn geen onderdeel van deze wijziging.
- De workbookgrenzen gelden ook voor de pure readers. De workerdeadline geldt
  voor UI-imports; synchrone SDK-aanroepen hebben daarmee geen harde CPU-deadline.
- Visuele GPU-acceptatie, echte Android/iPhone-tests en een volledige proef in
  de uiteindelijke SuperCloud-sandbox blijven afzonderlijke praktijktests.

## Herhalen

```bash
npm test -- --maxWorkers=2
npm run test:platform
npm run test:server
npm run build
npm run build:lib
node scripts/benchmark-safeguards.mjs /tmp/ocs-safeguards-performance.json
npm audit --omit=dev
npm --prefix mcp-server audit --omit=dev
cargo test --manifest-path src-tauri/Cargo.toml --lib project_save
```

De eerdere acht onderzoeksproeven beschrijven de oude uitgangssituatie op
`d4b5082`. Gebruik de nieuwe producttests voor acceptatie van 2026.44.6; een
herstelde fout maakt een oude observatieproef juist ongeldig.
