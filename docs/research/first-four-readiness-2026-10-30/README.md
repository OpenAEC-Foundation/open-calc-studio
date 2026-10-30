# Bestandsimport herstel prijsherkomst en revisies

Onderzoek van 30 oktober 2026 voor Open Calc Studio 2026.44.5, basiscommit
`d4b5082ee6154d2889f26262f816674326aa0a79`.

De eerste verbeteringen moeten verlies van werk en onjuiste bronkoppelingen
voorkomen. Prioriteit hebben de Excel-afhankelijkheid, betrouwbare herstelopslag,
vaste artikelidentiteiten en controle van de PDF-identiteit bij meetimport.
De vier onderzoeken beschrijven de uitgangssituatie van 2026.44.5. De latere
[implementatie en validatie van 2026.44.6](../project-safeguards-2026-10-30/README.md)
werkt deze bevindingen uit; de oude observatieproeven zijn geen acceptatietests
voor de inmiddels gewijzigde code.

## Uitgevoerde controles

- Productieafhankelijkheden: `npm audit --omit=dev --json`;
  [volledige uitvoer](production-audit.json).
- Acht gerichte, uitvoerbare onderzoeksproeven met synthetische projecten en
  de bestaande IFC-fixture: [waarnemingen](observations.json), [log](probes.log).
- 58 bestaande tests geslaagd: 39 voor projectopslag, mobiel, PDF, IFC,
  bronherkomst, browseropslag en hostopslag; 19 voor BasCalc en internationale
  XML/CSV/Excel-uitwisseling. Zie [baseline](baseline.log) en
  [importbaseline](import-baseline.log).
- Codecontrole van bestandspaden, autosave, prijsselectie en bronkoppelingen.

Deze controles gebruiken Vitest/Node en jsdom. Het zijn geen geforceerde
OS-crashes, echte telefoontests of bewezen exploits. De proef met PDF-identiteit
gebruikt alleen synthetische PDF-headers en toetst hash- en importvalidatie.

## 1 Veilige bestandsimport

### Bevindingen

De audit meldt vijf betrokken pakketten: vier met ernst `high`, één `moderate`.
Dat zijn pakketmeldingen, geen vijf aangetoonde aanvalspaden in de applicatie.

| Onderdeel | Vastgelegde versie | Beoordeling en vervolgstap |
| --- | --- | --- |
| `xlsx` | 0.18.5 | De applicatie leest bestanden in onder meer `tabularBudget.ts`, `genericTabularImporter.ts` en `bascalcImporter.ts`. De versie valt onder de twee SheetJS-meldingen. Onderzoek migratie naar de officiële 0.20.3-distributie. |
| `pdfjs-dist` | 5.6.205 | Valt onder de gemelde versiereeks. Mozilla noemt scripting plus ontbrekende beschermende CSP als voorwaarden. De huidige viewer gebruikt `getDocument` en canvasrendering; in de bekeken appcode is geen `PDFScriptingManager` of ingeschakelde scriptinglaag aangetroffen. Uitbuitbaarheid is niet aangetoond. Plan een gecontroleerde migratie naar een gepatchte 6.x-versie. |
| `@thatopen/components` | 3.4.1 | Transitieve melding via de XML-afhankelijkheden. De lockfile bevat `fast-xml-parser` 5.5.9 en `fast-xml-builder` 1.1.4. Bepaal welke gemelde parser-/builderfuncties de viewer werkelijk gebruikt voordat ernst op applicatieniveau wordt vastgesteld. |

SheetJS meldt herstel vanaf 0.19.3 voor prototype pollution en vanaf 0.20.2
voor ReDoS. De officiële installatiehandleiding verwijst naar 0.20.3 op de
SheetJS-CDN; een gewone registry-update van `xlsx@0.18.5` is daarom geen
volledig migratieplan. De download van die officiële tarball gaf tijdens dit
onderzoek HTTP 403. Compatibiliteit met 0.20.3 is dus nog niet gemeten.

Bronnen: [SheetJS prototype pollution](https://cdn.sheetjs.com/advisories/CVE-2023-30533),
[SheetJS ReDoS](https://cdn.sheetjs.com/advisories/CVE-2024-22363),
[officiële installatie](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/),
[Mozilla PDF.js](https://github.com/mozilla/pdf.js/security/advisories/GHSA-hq66-cqwq-w95j).

Er zijn al nuttige begrenzingen: ingebedde PDF's hebben een limiet van 30 MiB;
de genormaliseerde tabelimport controleert getallen, valuta en hiërarchie;
CSV-export weigert formuleachtige tekst. De onderzochte Excel-leesfuncties
hebben geen gemeenschappelijke limiet voor bestandsgrootte, uitgepakte omvang,
aantal cellen en verwerkingstijd vóór het parseren. Een PDF-groottegrens of
MCP-aanvraaglimiet dekt deze andere importpaden niet automatisch af.

### Uitvoerbaar updateplan

1. Verkrijg de officiële SheetJS-tarball, controleer herkomst en leg hash,
   licentie en exacte versie vast. Test eerst buiten de productinstallatie.
2. Vergelijk BasCalc, generieke XLS/XLSX, inschrijfstaat, normale tabeluitwisseling
   en spreadsheetexports met dezelfde bronbestanden. Leg bedragen, normen,
   null/zero, Unicode, datumcellen en formulecachegedrag vast. De 19 bestaande
   importtests vormen een begin, geen volledige bestandsmatrix.
3. Migreer PDF.js afzonderlijk: controleer de worker-URL, bundeling, rendering,
   kalibratie, zoom, rotatie en meetimport in browser en native app. Zet een
   scriptingoptie uitsluitend op het API-niveau dat die optie ondersteunt;
   een onbekend veld bij `getDocument` is geen bewezen beveiligingsmaatregel.
4. Werk de ThatOpen/XML-keten los daarvan bij en herhaal de IFC-fixtures.
5. Ontwerp één importbeleid voor UI, library en MCP: controle vóór parseren,
   begrensde verwerking in een worker, afbreken en een zichtbare foutmelding.
   Een worker alleen begrenst geheugen of uitgepakte archiefomvang niet.

Acceptatie: bestaande rekenuitkomsten blijven gelijk, de betreffende
auditmeldingen zijn opgelost of aantoonbaar niet van toepassing, en te grote
of ongeldige bestanden laten de bestaande begroting ongemoeid.

## 2 Herstel na vastlopen

### Wat werkt en waar gegevens verloren kunnen gaan

Desktop-autosave in `src/App.tsx` schrijft elke 120 seconden het actieve,
gewijzigde document met een bestaand pad. Nieuwe documenten zonder pad en
andere open tabbladen vallen daarbuiten. De instellingen `autoSave` en
`autoSaveInterval` sturen deze timer in de bekeken code niet aan.

Mobiel schrijft na wijzigingen een concept met een debounce van 700 ms en
bij `pagehide`. Proef R1 bevestigt dat de opgeslagen PDF-bytes, kalibratie,
metingen, IFC-uittrekstaat en spreadsheetcellen terugkomen na het opnieuw
opbouwen van de applicatiestore.
De oorspronkelijke IFC-bytes en de 3D-meshes zitten daarmee niet automatisch
in het herstelrecord: `ifcTakeoff` bewaart model-/hoeveelheidsmetadata, terwijl
de meshes in de runtime-sessie staan. Herstel van de 3D-weergave vraagt ook
toegang tot het juiste bronbestand.

Proef R2 begint met twee documenten en een begrotingssnapshot. Herstel levert
één document en nul snapshots op. Dat komt overeen met één conceptslot voor
het actieve document en de ontbrekende snapshotparameter bij serialisatie.

Proef R3 simuleert geweigerde opslag: `saveMobileDraft()` geeft `true`, maar
het concept staat uitsluitend in de geheugenfallback van `browserStorage`.
Een nieuwe module-instantie kan het niet lezen. Daarmee is “concept opgeslagen”
geen bewijs van duurzaam crashherstel. De proef is geen echte browsercrash.

Native opslag schrijft rechtstreeks naar het doelbestand via `writeTextFile`.
In die wrapper is geen tijdelijke schrijf-/renamecyclus of herstelkopie
zichtbaar; gedrag bij stroomuitval is niet vastgesteld. Bij native opslaan
wordt na het wachten op de schrijfactie de gewijzigde-status gewist. Een edit
tijdens die schrijfactie verdient een afzonderlijke raceproef. De hostopslag
heeft hiervoor al een inhoudsvergelijking en geslaagde conflicttests.

### Ontwerp voor de eerste verbetering

- Bewaar een herstelrecord per document, inclusief een nog naamloos document,
  met projectinhoud, snapshots, documentidentiteit, inhoudsversie en tijdstip.
- Houd herstelopslag gescheiden van expliciet opslaan naar het projectbestand.
  Gebruik in de browser een transactionele opslag voor grote bijlagen en in
  de desktop een journal in de appdatamap. Meld quotafouten zichtbaar.
- Rapporteer “opgeslagen” pas na bevestigde duurzame opslag; toon bij een
  geheugenfallback expliciet dat herstel na sluiten niet gegarandeerd is.
- Schrijf native via een tijdelijk bestand op hetzelfde bestandssysteem,
  controleer de inhoud en vervang het doel atomair waar dat platform dit
  ondersteunt. Behoud een herstelbare vorige versie. Test platformgedrag.
- Laat de gebruiker na herstart herstellen, vergelijken of verwijderen.
  Herstel mag een later extern gewijzigde projectversie niet overschrijven.

Acceptatieproeven: meerdere tabbladen; naamloos document; PDF-bijlagen; volle
of geweigerde opslag; corrupt herstelrecord; onderbroken schrijfactie;
bewerken tijdens opslaan; twee appvensters; herstel zonder werkende host.
Voer de echte crashproeven uitsluitend op tijdelijke projecten uit.

## 3 Herleidbare prijzen

### Bevindingen

Bron- en peildatumvelden bestaan al in `ResourceLibraryItem`. De prijsselectie
toont de bron en blokkeert onbekende eenheden; proef P3 bevestigt dit voor
`pallet`. Bestaande prijzen zijn dus niet allemaal bronloos of ongecontroleerd.

Proef P1 toont wel dat hetzelfde artikel door hersorteren van `lib-0-A` naar
`lib-1-A` verandert. De parser bouwt het ID op uit de lijstindex en artikelcode.
Een bestaande begrotingskoppeling is daardoor niet geschikt om latere
bibliotheekversies betrouwbaar te herkennen.

Proef P2 bevestigt dat de gekopieerde prijs en het `resourceLibraryId` de
gewone projectopslag overleven, terwijl `resourceLibrary` leeg wordt geschreven.
`ResourcePicker` kopieert bron en peildatum niet als een prijsherkomstrecord
naar de rekenregel. Alleen het resterende ID reconstrueert de gebruikte
bibliotheekversie niet. Hostopslag kan een oorspronkelijk ingebedde
`hostProject.resourceLibrary` behouden; dit maakt de gewone opslag nog niet
equivalent aan een volledige bronregistratie.

### Ontwerp voor de eerste verbetering

Geef catalogus en artikel vaste identiteiten die niet van volgorde afhangen.
Voeg catalogusversie, bronhash, peildatum, valuta en oorspronkelijke eenheid toe.
Sla bij toepassen een zelfstandig prijsherkomstrecord op de begrotingsregel op:
artikelidentiteit, gebruikte versie, toegepaste prijs, datum, conversie en
eventuele projectoverride. Een project moet ook zonder de externe catalogus
de oorspronkelijke prijs kunnen verklaren.

Een updatevoorstel vergelijkt oude en nieuwe bronprijzen en toont het effect
op regels en hoofdstukken. Dubbele codes, ontbrekende artikelen en afwijkende
valuta of eenheden krijgen een eigen beoordeling. Vergrendelde of handmatig
afgesproken prijzen blijven behouden totdat de gebruiker ze expliciet kiest.
Geselecteerde wijzigingen vormen één terug te draaien actie; hoeveelheden,
normen, tariefgroepen en inactieve varianten blijven intact.

Acceptatie: hersorteren verandert de identiteit niet; twee catalogi mogen
dezelfde artikelcode hebben; broninformatie blijft bewaard na opslaan en
heropenen; een eigen prijs blijft staan; een gedeeltelijke update en undo
geven reproduceerbare totalen. Registreer per externe bron ook de toepasselijke
gebruiksvoorwaarden voordat de gegevens worden gebundeld of verspreid.

Dit actualiseert het bestaande [catalogusvoorstel](../calculation-packages-2026-09-28/issues/02-catalogue-updates.md).

## 4 Model en tekenrevisies

### Bevindingen

PDF en IFC gebruiken al inhoudshashes; gelijke bestandsnamen zijn dus niet hun
enige interne identiteit. Hoeveelheidsherkomst bewaart daarnaast de PDF-pagina,
meet-ID, IFC-modelidentiteit, selectie en exacte hoeveelheidssleutel. De
bestaande tests bevestigen behoud van de laatst bekende hoeveelheid wanneer
de bron verdwijnt.

Proef V1 toont een grens in de uitwisseling met Open PDF Studio: een meetexport
voor `plan.pdf` wordt geaccepteerd voor twee inhoudelijk verschillende bronnen
met die naam. De huidige exportvalidatie gebruikt de naam, niet de PDF-hash.
Dit bewijst een ontbrekende identiteitscontrole, geen fout in de PDF-renderer.

Proef V2 hernummert in de bestaande IFC-fixture `#20` naar `#120`. Het GlobalId
en de nettohoeveelheid blijven gelijk, maar de oude Express-ID-selectie is
ongeldig in de nieuwe revisie. De huidige uittrekstaat bewaart revisiegebonden
Express IDs. Een modelhash bewaakt de exacte bron, maar verzorgt geen
beoordeelde koppeling tussen twee revisies.

`versionSlice` vergelijkt begrotingsregels en bedragen. Dat is nuttige basis,
maar geen geometrische PDF-overlay of IFC-revisievergelijking.

### Ontwerp voor de eerste verbetering

1. Bewaar per bron een revisierecord met inhoudshash, revisielabel, datum en
   eventuele voorganger. Laat oude koppelingen naar hun oorspronkelijke bron
   verwijzen totdat een wijziging is beoordeeld.
2. Voeg de PDF-hash toe aan de meetexport van Open PDF Studio en controleer
   die bij import. Behandel oude exports zonder hash als onbevestigd en laat
   de gebruiker de bron expliciet controleren.
3. Vergelijk PDF-pagina's met uitlijning, rotatie en schaalcontrole. Neem
   kalibratie en meetpunten pas over nadat de gebruiker heeft bevestigd dat
   de betreffende pagina overeenkomt.
4. Gebruik voor IFC een combinatie van modelrevisie en GlobalId als
   matchvoorstel; bewaar Express IDs per revisie. Ontbrekende, dubbele of
   veranderde GlobalIds vragen beoordeling. Dwing nooit een match op naam af.
5. Toon per begrotingsregel de oude en voorgestelde hoeveelheid, eenheid,
   netto/bruto-sleutel en het kosteneffect. Laat selectief toepassen en undo
   toe; ontbrekende bronnen worden niet automatisch nul.

Acceptatie: dezelfde naam met andere bytes; gewijzigde paginavolgorde;
90-gradenrotatie; andere schaal; hernummerde IFC-entiteiten met gelijk
GlobalId; verwijderde en dubbele objecten; netto/bruto-verwisseling;
millimeters tegenover meters; selectief toepassen, undo en heropenen.

Dit bouwt voort op [PDF-meetdossier](../calculation-packages-2026-09-28/issues/01-persist-takeoff.md)
en [tekenrevisies](../calculation-packages-2026-09-28/issues/04-drawing-revisions.md).

## Volgorde voor uitvoering

| Stap | Afgebakend resultaat | Afhankelijkheid |
| --- | --- | --- |
| A | Geteste SheetJS-migratie en beoordeling van PDF/XML-meldingen | Toegang tot de officiële distributies en aparte compatibiliteitsproeven |
| B | Duurzame herstelopslag met zichtbare foutstatus, meerdere documenten en snapshots | Opslagcontract voor browser, native en host |
| C | Vaste catalogus-ID's en prijsherkomst per begrotingsregel | Additieve bestandsmigratie en round-triptests |
| D | PDF-hash in meetuitwisseling en revisierecords voor PDF/IFC | Afstemming met Open PDF Studio |
| E | Prijsupdatepreview en beoordeelde hoeveelheidswijzigingen | C en D; bestaande calculator en undo behouden |

## Onderzoek herhalen

Voer vanuit de repositoryroot uit:

```bash
npx vitest run --config research/readiness/vitest.config.ts
npm audit --omit=dev --json
npx vitest run src/test/pdfWorkspace.test.ts src/test/ifcLiteTakeoff.test.ts src/test/quantityOrigin.test.tsx src/test/mobileWorkspace.test.tsx src/test/siteHost.test.ts src/test/fileService.v21.test.ts src/test/fileService.test.ts src/test/hostedStorage.test.ts src/test/bascalcTotals.test.ts src/test/budgetConversion.test.ts --maxWorkers=2
```

De onderzoeksproeven schrijven standaard naar `/tmp/ocs-first-four-observations.json`.
Met `OCS_RESEARCH_OUTPUT` is een ander bestaand doelpad te kiezen. De proeven
beschrijven de onderzochte uitgangssituatie; een toekomstige oplossing kan
juist een observatie ongeldig maken. Zij draaien daarom uitsluitend met de
expliciete onderzoeksconfiguratie. `npm audit` geeft bij meldingen exitcode 1.
