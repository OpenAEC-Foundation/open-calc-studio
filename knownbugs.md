# Bekende bugs en bijvangst

Alles wat een sessie of agent tegenkomt en **niet bij de eigen taak hoort** komt hier: bugs, vreemd gedrag,
verouderde teksten of docs, wensen. Fix het niet stilletjes in een PR over iets anders; zet het hier en noem
het in je rapport of PR-tekst. Kijk hier ook eerst voordat je een "nieuwe" bug meldt.

**Beveiligingsproblemen horen hier niet.** Deze repo is openbaar; meld een lek privé via GitHub
(Security → Report a vulnerability) of rechtstreeks aan de maintainers.

**Zo voeg je iets toe**

- Onderaan in de passende sectie, met het volgende vrije nummer. Nummers worden nooit hergebruikt, ook niet
  na een fix (andere teksten verwijzen ernaar).
- Eén punt: **wat er misgaat** (vetgedrukt, kort), dan waar (`bestand:regel`, scherm of stap) en hoe je het
  zag, en een voorstel als je er een hebt. Sluit af met de zekerheid:
  - **B** = bevestigd: nagespeeld in de app, met een test of script, of door een tweede agent in de code
    gecontroleerd.
  - **S** = alleen gemeld: gezien of afgeleid, maar niet onafhankelijk getoetst.
- Verzin niets: wat je niet hebt gezien of gemeten, schrijf je niet als feit op.
- Opgelost? Haal het punt weg in dezelfde PR als de fix, en noem het nummer in de PR-tekst.

De eerste lijst (punten 1 t/m 266) komt uit een codereview met subagents op 2026-11-06; 45 van de
belangrijkste punten zijn daarna door een tweede agent opnieuw gecontroleerd. Regelnummers gelden voor de
stand van `main` op die datum.

## Rekenen en totalen

302. **Kengetallen en opgeslagen versies laten de opslagen oude stijl (ukk/ak/wr) en de afronding weg uit het
     totaal excl. btw.** `src/components/report/ProjectInfoSettings.tsx:80` en `src/state/slices/versionSlice.ts:109`
     gebruiken `getStaartBreakdown(...).aanneemsomExcl`, dat alleen het Bouw 1-model optelt (kostprijs + risico,
     winst, verzekering). Bij BasCalc-imports is dat lager dan het gridtotaal; de afronding ontbreekt altijd,
     terwijl het commentaar in `versionSlice.ts` zegt dat die erin zit. Dezelfde oorzaak als knownbug 193 (wizard,
     opgelost met `aanneemsom + afronding`). Gezien in de code, niet in de app nagespeeld. Voorstel: één gedeelde
     helper voor het totaal excl. btw. — S

## Tabel, invoer en bediening

28. **"Kopiëren naar Excel" schrijft getallen met een decimale punt, dus Nederlandse Excel maakt van 12.5 een
    datum.** `excelClipboard.ts:24-26` (`String(n)`; ook float-ruis, en 0 wordt leeg). Voorstel: dezelfde
    opmaak gebruiken als `getGridCellDisplayValue`. — S

42. **UI-3 ("eenvoudig") gebruikt de kolombreedtes van UI-1, gekoppeld op positie.**
    `src/state/slices/viewSlice.ts:20,39-41`, `CostGrid.tsx:71-75,142`, `GridHeader.tsx:15-19,131`. Nagespeeld:
    Omschrijving wordt 50px, Eenheid 380px, en een kolom verbreden in UI-3 verandert de breedtes van UI-1.
    Voorstel: breedtes per kolomsleutel opslaan in plaats van per positie (lost ook #43 op). — B

43. **Varianten aanzetten schuift elke breedte na de ID-kolom één plek op.**
    `src/components/grid/gridConstants.ts:125-131` + de positie-arrays in `viewSlice.ts`. Nagespeeld: in UI-2
    wordt Nr. 240px en Omschrijving 70px. `setColumnWidth` past ook de minimumbreedte van de verkeerde kolom
    toe. Zie #42 voor het voorstel. — B

270. **In UI-2 is de productiecapaciteit onzichtbaar, terwijl hij uren en loon deelt.** De WpCalc-kolommen
    (`src/components/grid/gridConstants.ts`, `WPCALC_COLUMN_DEFS`) hebben geen kolom pcap; een capaciteit die in
    UI-1 is ingevuld blijft wel meetellen. De tooltips "Uren" (`tooltips.wpHours`, `common:tooltip.hoursFormula`)
    zeggen "aantal × norm", zonder de deling. Gevonden bij de fix van knownbug 9. Voorstel: pcap ook in UI-2
    tonen (eventueel alleen als hij niet 1 is) en de tooltips aanvullen. — B

## Spreadsheets

56. **Het verwijderen van een deelspreadsheet is niet ongedaan te maken.** `removeSubSheet` legt wel een stap
    vast, maar daarna is er geen editor van dat blad meer om Ctrl+Z in te drukken (zonder open blad gaat Ctrl+Z
    naar de begroting), en `undoSpreadsheet` vervangt alleen bladen die nog bestaan. Sinds de geschiedenis per
    blad (punt 55) verbruikt Ctrl+Z in een ander blad die stap niet meer. Open vraag: waar hoort het terugzetten
    van een verwijderd blad (Ctrl+Z in de begroting, een knop)? Voorstel: het blad op zijn oude plek opnieuw
    invoegen als het niet meer bestaat. — B

## Bestanden, import en export

66. **`calculatiedatum` in de WPCalc-export klopt niet.** `wpcalc_export.rs:539-552` rekent met jaren van 365
    dagen en maanden van 30 dagen: 2026-11-06 wordt `11/24/2026` en 2026-12-31 wordt `01/14/2027`. Voorstel:
    `chrono::Local::now().format("%m/%d/%Y")`. — S

77. **GAEB-Bedarfspositionen (`Provis WithoutTotal`) en alternatieven (`ALNGroupNo`) tellen mee in het totaal**,
    zonder enige markering (`gaebImporter.ts:73-80`). Minder zeker dan de andere importpunten. — S

91. **DNC: de terugvalsamenvatting negeert mogelijk `TOT3` (materieel).** `dncImporter.ts:298-302`. Gezien
    bij het nalopen van de negatieve KU-bedragen #90; nog controleren met een echt bestand. — S

93. **S01: de codering van echte STABU-bestanden is niet gecontroleerd.** `.s01` wordt als UTF-8 gelezen;
    is een echt bestand Windows-1252 of CP850, dan worden letters als Ë verminkt. (Titels met Ë e.d. worden
    inmiddels wel herkend.) Gezien bij #92. — S

95. **BasCalc leest de S-kolom op twee tegengestelde manieren.** Bij `ih`-regels is h arbeid en m materiaal
    (`bascalcImporter.ts:228-236`); bij `cn`-regels is m arbeid en h materieel (`mapResourceType`, r.27-31).
    Nog controleren met een echt bestand. — S

103. **CUF: de staart en het soort middel gaan verloren bij opnieuw importeren.** Subhoofdstukken en `<Regel>`s
     komen sinds de fix wel terug (`knownbugsCufTradxml103-274.test.ts`), maar `<Staart>` (`cufExporter.ts:20-33`)
     wordt nooit teruggelezen, en `<Regel>` krijgt geen `type`-attribuut (`cufExporter.ts:renderRegel`), zodat
     elke regel na herimport "overig" is. De staart stond al in de bevestigde melding; het soort middel heb ik
     alleen in de code gezien.
     Voorstel: de exporter `<Middel type=…>` laten schrijven (prijs per eenheid) en de staart als
     schema-percentages teruglezen. — B (staart), S (soort middel)

269. **Oude CUF: Middel-regels per eenheid geven na herberekenen een te laag posttotaal.**
    `src/services/importers/cufImporter.ts`, `addRegel`. Sinds de fix voor #96 worden Middel-regels vaste bedragen
    (aantal × prijs) en is het posttotaal hun som; de hoeveelheid van de post telt niet mee. Zijn Middel-
    aantallen in dit formaat per eenheid bedoeld (0,5 uur per m³ bij 10 m³), dan wordt € 225 na herberekenen
    € 22,50. Niet te controleren zonder echt bestand. (#97 is opgelost: een oude CUF-post neemt de hoeveelheid,
    eenheid en prijs van zijn Middel niet meer over.) Gevonden in de review van PR #70. — S

271. **WpCalc-export meldt "OK" ook als losse INSERTs mislukken.** Het PowerShell-script in
    `src-tauri/src/wpcalc_export.rs` stopt niet bij fouten, dus regels kunnen ontbreken zonder melding.
    (Gaat de database helemaal niet open, dan stopt het script nu wel met een fout.)
    Gevonden bij de fix van knownbug 64. Voorstel: fouten tellen en melden; `$ErrorActionPreference='Stop'`
    pas na een test met echte bestanden. — B

273. **WpCalc-export vult het veld `calculaties.valuta` niet.** De import leest het sinds de valutafix wel;
    de export schrijft geen valuta (Rust-kant). Gevonden bij de valutafix. — B

278. **Andere importers lezen onleesbare bedragen nog stil als 0.** Alleen de generieke import
    (`genericTabularImporter.ts`) waarschuwt; BC3, DNC, inschrijfstaat en de XML-hulpfuncties gebruiken
    `parseNumber` (`core.ts`) zonder melding. Rest van knownbug 82. Gevonden in de review van de valutafix. — B

280. **WpCalc-import zonder herkende staartlabels geeft geen btw-regel en geen melding.** Een label dat
    `classifyWpCalcStaartLabel` (`wpcalcImporter.ts`) niet kent, valt stil weg; zonder btw-regel is incl.
    btw gelijk aan excl. btw. "B.T.W.", "Omzetbelasting", "VAT" en "Risicoverzekering" worden inmiddels
    herkend; andere Engelse teksten niet. Ook: een label met "totaal" valt weg, en een tweede regel van
    dezelfde soort telt niet mee. Open: een melding bij onbekende labels (de import heeft nog geen
    meldingenkanaal) en wat er met dubbele soorten moet. Gevonden in de review van knownbug 88. — B

## Documenten, tabbladen, versies en herstel

119. **Een ander open venster toont het live journaal van dit venster als "herstelbaar".**
     `src/components/common/RecoveryBar.tsx:17`, `recovery.ts:14,39`. Een losgemaakt tabbladvenster of een tweede
     browsertabblad biedt de live documenten van het hoofdvenster aan. Herstellen dupliceert ze; Weggooien wist het
     live journaal. Voorstel: een levenssignaal per venster (heartbeat of `navigator.locks`). — S

298. **Het autosave-interval wordt één keer gelezen, vóór de instellingen geladen zijn** (latent).
     `src/App.tsx:390-399`: `setInterval` gebruikt `settings.autoSaveInterval` op het moment van mounten
     (dus de standaardwaarde), en het effect hangt alleen van `saveFileForClose` af. Een opgeslagen of later
     gewijzigd interval werkt pas na een herstart, of niet. `autoSave` staat standaard uit en heeft geen UI
     (zie 120); overgebleven uit knownbug 230, waarvan alleen de docs zijn rechtgezet. — S

## Rapport, offerte en afdrukken

122. **"Alleen hoofdstuktotalen" met Hoofdaanneming drukt in de PDF geen bedragen af.** Hoofdaanneming toont
     bedragen alleen in de subtotalen van posten, en juist die posten worden weggefilterd
     (`src-tauri/src/reports/generator.rs:743-806`, `"total" | "unitPrice" if use_chapter_subtotals`). Het
     resultaat: hoofdstukregels met een lege bedragkolom en daarna alleen het eindtotaal. De HTML-afdruk
     (`printService.ts`) is hersteld; Rust nog niet. Voorstel: toon bij alleen-hoofdstuktotalen `item.total` op
     de hoofdstukregels. — B

131. **Secties "Opties" komen nooit in de offerte-PDF; introteksten en regelomschrijvingen vallen weg.**
     `src-tauri/src/reports/offerte.rs:81-88` en `243-300` behandelen alleen technisch/meerwerk/opdrachtgever/
     vrij; `OfferteTab.tsx:219` en `OfferteView.tsx:167` maken wel `opties` aan. Tweede controle: klopt, maar
     overdreven: technisch drukt intro en omschrijvingen wél af (`OfferteTab.tsx:24`). Voorstel: een tak voor
     `opties` toevoegen; de introtekst en omschrijvingen afdrukken. — B

132. **"Geldig voor N dagen" verdwijnt als de tekst van de voorwaarden leeg is.** `offerte.rs:122-136`. Afgeleid
     uit de code. Voorstel: de alinea over de geldigheid uit het `voorwaarden`-blok halen. — S

137. **De sjabloonkeuzelijst vervangt de hele offerte zonder bevestiging of undo** (`OfferteTab.tsx:309-320`).
     Met minder zekerheid gemeld. — S

138. **In donkere modus blijft de achtergrond van `:root` mogelijk donker bij afdrukken op het web**
     (`src/services/print/browserPrint.ts:27-30`; de printstijl zet alleen hoogte en overflow van `html` en
     `body` terug). Niet getest. (Het eerste deel van dit punt, de witte totaalregel van het IFC-rapport, is
     hersteld.) — S

141. **De inhoud van de offerte-PDF begint 15 mm te hoog en valt over het briefhoofd.**
     `src-tauri/src/reports/offerte.rs:58-59` maakt het frame met `Rect::new(margin_left, margin_bottom, …)`,
     terwijl `openaec-layout` vanaf de bovenkant van de pagina meet. Dezelfde fout is in `generator.rs` al
     hersteld (commit 45e8f0b), de offerte is toen overgeslagen. Nagespeeld: de eerste regel staat op 27,8 mm
     in plaats van ongeveer 40 mm van de bovenrand. Voorstel: `margin_top` meegeven. — B

142. **Een `<` in een alinea wist tekst in de PDF, en een gesplitste alinea verliest haar regeleinden.**
     `libs/openaec-reports` → `openaec-layout/src/paragraph.rs:79-91` (`strip_tags`) ziet alles van `<` tot `>`
     als opmaakcode: `"Fundering diepte < 3 m, wapening > 12 mm"` wordt `"Fundering diepte 12 mm"`, en
     `"Kantoor <2025 fase 1"` wordt `"Kantoor"`. Dat raakt projectnamen, staartomschrijvingen en alle
     offerteteksten. Daarnaast plakt `split` (`:283-293`) de stukken met `" "` aan elkaar, zodat het deel op de
     volgende pagina zijn alinea's en regeleinden kwijt is. Voorstel: alleen `<b>`, `</b>`, `<i>`, `</i>`
     strippen; in `split` met `"\n"` samenvoegen en lege regels behouden. — B

143. **Tabelcellen in de PDF negeren regeleinden, en ingesprongen vervolgregels lopen de volgende kolom in.**
     `openaec-layout/src/table.rs:196-270` (`wrap_text`) behandelt `"\n"` niet als regeleinde. De technische
     sectie van de offerte bouwt haar omschrijving met `desc_parts.join("\n")` (`offerte.rs:221`); de opsomming en
     eigenschappen komen op één regel en de rijhoogte blijft één regel (37,6 pt). Vervolgregels worden zonder de
     inspringing gemeten: in een kolom van 100 pt werd een regel ongeveer 121 pt breed. Voorstel: eerst op `'\n'`
     splitsen en per deel afbreken; vervolgregels mét inspringing meten. — B

146. **Het percentage van een betalingstermijn in de offerte-PDF volgt de rapporttaal niet.** `offerte.rs:98`
     formatteert met `{}`, wat `12.5%` geeft in een Nederlandse offerte. — S

147. **Hoofdstukkoppen in de Bouw 1-PDF kunnen los onderaan een pagina blijven staan.** In
     `tenants/bouw1/begroting.typ:107-109` staat de kop als losse `text()` vóór de tabel, zonder iets dat hem bij de
     tabel houdt. Voorstel: `block(sticky: true)`. — S

148. **In `openaec-layout` doen afbeeldingsuitlijning en zebrastrepen het niet goed.**
     `image_flowable.rs:125-126` rekent midden en rechts uit als `x + w/2 - w/2` en `x + w - w`, dus altijd `x`
     (alleen gebruikt door `openaec-core`/`gen_pdf`, niet door de app). In `table.rs` beginnen gesplitste tabellen
     na een paginawissel weer bij rij 0, wat alleen telt bij gestreepte tabelstijlen. — S

283. **Losse regels zonder hoofdstuk verdwijnen uit de PDF-tabel bij "alleen hoofdstuktotalen"**, maar tellen
     wel mee in het totaal (`shows_row`, `reports/mod.rs:60`); de "kostprijs"-regel in `generator.rs:835`
     telt alleen hoofdstukken. Hoofdstuk 1000 + losse regel 500 toont 1000 en een totaal van 1500. — S

284. **Afronding in de Rust-staart kiest `staartDoelbedrag` vóór `staartVastBedrag`**, de app andersom
     (`staart.rs:140`). Alleen bereikbaar als beide gezet zijn (MCP of een bewerkt bestand). — S

291. **`gen_pdf` (ontwikkeltool) maakt bij Bouw 1 een PDF zonder tekst op een schone checkout.**
     `src-tauri/src/bin/gen_pdf.rs:186-197` laat openaec-core Arial uit `tenants/bouw1/fonts` lezen; die map
     werd tot #99 door de app zelf gevuld. De app gebruikt het niet, maar de losse MCP-server wel: `export_pdf`
     (`mcp-server/src/index.ts:1555`) roept `gen_pdf` aan, standaard met Bouw 1. Voorstel: naar Liberation Sans
     laten wijzen of het Bouw 1-pad weghalen. — S

292. **Rapporten in 6 talen tonen hun labels niet: ja, zh, ko, lo, hi en ta.** Geen ingebouwd lettertype
     heeft die schriften, en dat was vóór #99 op Windows ook al zo (Arial en Segoe UI evenmin). De labels en
     door de gebruiker getypte tekst in die schriften ontbreken in alle PDF-rapporten, op elk systeem, zonder
     melding; ook de CJK-valutatekens 元 en ￥. (th en bn tonen hun tekens sinds Noto Sans Thai en Noto
     Sans Bengali meegaan, maar niet overal netjes gezet, zie 294.) Voorstel: Engelse labels als terugval voor die talen, of een waarschuwing bij het
     kiezen van zo'n rapporttaal. Lettertypen meeleveren kost veel: CJK alleen al is meer dan 15 MB. —
     B (cmap-vergelijking per rapporttaal)

293. **Typst-rapporten zetten Arabische, Perzische, Urdu en Hebreeuwse regels links uitgelijnd en van links
     naar rechts.** De woorden zelf zijn goed (aan elkaar, van rechts naar links), maar `begroting.typ` en
     `ibis.typ` zetten geen `lang` of `dir`, en `reportI18n.ts:142` haalt de richtingstekens weg. Een label
     met een Latijns stuk (zoals "Bouw 1") of een valuta met punt (د.إ.) staat daardoor in de verkeerde
     volgorde voor wie van rechts naar links leest. Voorstel: `text(dir: rtl)` voor ar, fa, ur en he. — S
     (uit de Typst-bronnen afgeleid, niet nagespeeld)

294. **openaec-layout-rapporten zetten Arabisch, Bengaals en Thai niet goed.** Werkbeschrijving, hoofd- en
     onderaanneming, inschrijfstaat, nacalculatie en offerte tekenen elk teken los, van links naar rechts
     (geen shaping in openaec-layout). Arabische, Perzische en Urdu-letters staan daardoor los en in
     omgekeerde volgorde, zoals vóór #99 op Windows; Bengaalse klinkertekens zoals ি staan achter in plaats
     van vóór hun medeklinker, zonder ligaturen. Thaise klinker- en toontekens staan boven hun medeklinker,
     maar botsen als er twee boven elkaar horen (ที่) en schuiven niet op bij hoge medeklinkers (ป ฝ ฟ). De
     tekens zelf staan er wel (terugvallettertypen in `reports/fonts.rs`). De Typst-rapporten vormen deze
     letters wel goed (voor de regelrichting zie 293). Vet Thai en Bengaals komt in beide engines normaal uit:
     alleen de normale snit gaat mee. Voorstel: shaping en bidi in openaec-layout (rustybuzz, unicode-bidi).
     — B (Arabisch in een voorbeeld-PDF gezien; Bengaals en Thai uit de glyph-metrieken, door twee agents)

## IFC, PDF en hoeveelheden

155. **De meegeleverde Open PDF Studio-plugin geeft nooit een PDF-hash mee, dus zijn imports worden nooit
     geverifieerd.** `integrations/open-pdf-studio/index.js:13` tegen `src/services/pdf/pdfWorkspace.ts:65-66`.
     Zonder opt-in krijg je de fout "no PDF hash"; met opt-in is elke hoeveelheid `verified: false` met een
     reviewwaarschuwing. De tests zetten `sourceHash` met de hand. Tweede controle: klopt, maar overdreven; in
     de UI is het alleen een bevestigingsvenster, een harde fout alleen via MCP/API (`pdfWorkspace.ts:69-71`),
     ernst laag. Voorstel: laat de plugin de SHA-256 van de PDF berekenen en in `sourceHash` zetten. — B

157. **Het PDF-tabblad verlaten en terugkomen gooit onafgemaakte punten weg.** De viewer wordt bij het
     verlaten ontkoppeld (`App.tsx`, `activeContentTab === 'pdf'`) en de punten staan in lokale state van
     `PdfViewer.tsx`. (Het terugspringen naar pagina 1 of naar een oud doel is opgelost.) Productvraag: moeten
     halve metingen een tabwissel overleven? Zo ja, de punten in de store bewaren. — S

296. **IFC-export schrijft heel kleine of heel grote getallen als ongeldige STEP-REAL.**
     `formatStepFloat` (`src/services/ifc/ifcHelpers.ts`) gebruikt `toString()`: 1e-7 wordt `1e-7.`, 2.5e-7
     blijft `2.5e-7` en 1e21 wordt `1e+21.`; STEP verwacht iets als `1.E-07`. Nagespeeld in Node. Komt alleen
     voor bij extreme waarden. Voorstel: exponent omzetten naar de STEP-vorm (`1.E-07`). — B

297. **IFC-export hangt de posten met `IfcRelNests` aan de `IfcCostSchedule`.** `ifcCostGenerator.ts`
     (onderaan, "Top-level items nested under schedule"). Voor zover bekend verwacht IFC4/IFC4X3 dat posten via
     `IfcRelAssignsToControl` aan een kostenschema hangen en alleen onderling met `IfcRelNests` genest zijn.
     Niet getoetst met een IFC-validator. Voorstel: eerst met een validator (bv. IfcOpenShell) controleren;
     zo ja, `IfcRelAssignsToControl` schrijven en de parser beide laten lezen. — S

## Varianten

161. **Je kunt een regel niet vanuit de interface in een variant zetten.** De kolom is `editable: true`
     (`src/components/grid/gridConstants.ts:103`), maar `isCellEditable` (`:182-237`) heeft geen `'branch'`-case;
     `useGridEditing.ts:57-61` zou bovendien naar `branch` (de naam) schrijven in plaats van naar `branchId`.
     `branchId` is alleen via MCP of een bestand te zetten, dus het hele variantfilter heeft in de praktijk niets
     om op te filteren. Nagespeeld. Voorstel: een `'branch'`-case met een keuzelijst van branch-id's, en een
     keyMap-regel `branch → branchId`. — B

162. **Een variant verwijderen laat zijn regels achter, verborgen maar nog meegeteld.** `removeBranch` in
     `src/state/slices/costScheduleSlice.ts:130-152`. Nagespeeld: het hoofdstuktotaal blijft 150 terwijl het
     grid 100 toont; in "Alle varianten" komt de regel terug met het label "main". Tweede controle: klopt, maar
     het meetellen in grid en statusbalk is met de fix van 12/264 weg zolang varianten aan staan; ernst laag. Voorstel: de regels verwijderen of naar de bovenliggende
     branch verplaatsen. — B

163. **Nieuwe regels nemen de variant van hun ouder niet over, en het filter werkt per regel in plaats van per
     deelboom.** `src/services/grid/variantScope.ts:9`; `addItem`/`addRegel`/`addChapter` in
     `costItemsSlice.ts:167+`. Nagespeeld: een post onder een verborgen Alt-hoofdstuk verschijnt in het blok van
     het vorige hoofdstuk. Voorstel: de `branchId` van de ouder overnemen en hele deelbomen verbergen. — B

164. **Inspringen (Tab) kan een regel onder een ouder uit een verborgen variant zetten.** `indentItem` gebruikt
     de volledige `state.items` (`costItemsSlice.ts:494-509`). Nagespeeld. Voorstel: de ouder kiezen uit de
     op variant gefilterde broers en zussen (ook `outdentItem`/`moveItems` nakijken). — B

## Assistent, MCP en extensies

187. **Bestandskoppeling werkt onbetrouwbaar** (`src-tauri/src/lib.rs:262-274`). Op macOS wordt
     `RunEvent::Opened` genegeerd, dus de app opent leeg. Op Windows/Linux gaat het event één keer af na vaste
     800 ms, zodat het bij een koude start gemist kan worden. Een tweede dubbelklik start een tweede app-proces.
     Voorstel: `RunEvent::Opened` afhandelen; de frontend het wachtende pad laten ophalen zodra zijn listener
     klaar is; een single-instance-plugin gebruiken. — S

188. **De Snap Layouts-popup van Windows 11 op de maximaliseerknop verschijnt nooit.**
     `handleMaximizeHover` in `src/components/layout/TitleBar.tsx` (~135-145) roept
     `plugin:decorum|show_snap_overlay` aan, maar de decorum-plugin is nooit toegevoegd (staat niet in
     Cargo.toml/lib.rs); de fout wordt ingeslikt. Gezien in de code. Voorstel: `tauri-plugin-decorum` toevoegen,
     of de dode hover-code weghalen. — S

189. **Dubbelklikken op de titelbalk schakelt maximaliseren waarschijnlijk twee keer.** `TitleBar.tsx:158-161`
     heeft een eigen `onDoubleClick` naast `data-tauri-drag-region`, terwijl Tauri's `drag.js` al zelf
     schakelt. Afgeleid uit de code; nog nakijken in een echt venster. Voorstel: `onDoubleClick` weghalen. — S

301. **Een extensie-ZIP met een data descriptor (bit 3) wordt niet gelezen.** `parseZipEntries` in
     `src/extensions/extensionService.ts` leest de gecomprimeerde grootte uit de local file header. Tools die
     streamend inpakken (bit 3 gezet) zetten daar 0 en schrijven de grootte pas na de data, dus de parser leest
     een leeg bestand en stopt bij de volgende "header". Gezien in de code, niet nagespeeld met zo'n ZIP.
     Voorstel: de groottes uit de central directory lezen, of de bestaande xlsx/JSZip-bibliotheek gebruiken. — S
303. **De losse MCP-server houdt eigen celwaarden bij die afwijken van de app.** `set_cell` en `set_cells_batch` in
     `mcp-server/src/index.ts:2092-2142` zetten `computed` met `parseFloat` (`6,66` wordt 6, `1.234,56` wordt
     1.234), rekenen formules niet uit en vervangen de hele cel (opmaak weg). `get_cell` (`:2110`) leest die kopie,
     dus de assistent ziet andere waarden dan de app toont. De app zelf rekent sinds de fix van punt 52 en 276 wel
     goed. Gezien in de code, niet nagespeeld. Voorstel: dezelfde getalnotatie en formule-evaluatie gebruiken als
     `subSheetSlice.ts`, of de waarden uit de app opvragen. — S

## Wizard, bibliotheek en prijzen

194. **Verf is geprijsd per post (`ls`) in plaats van per liter** (data). `src/data/nl-price-library.json`
     AF.005/AF.006, `defaultResourceLibrary.ts:107-108`. Voorstel: uitdrukken per m², of een eenheid liter
     toevoegen. — S

## Weergave, mobiel en toegankelijkheid

199. **Schermlezers krijgen geen informatie uit het hoofdgrid.** `CostGrid.tsx:501-509`, `GridCell.tsx:338`,
     GridRow, `GridCellEditor.tsx:252`. Afgeleid uit de code, niet in de app getest. Voorstel:
     `role=grid/row/gridcell`, `aria-rowcount`/`aria-rowindex`, `aria-activedescendant` en een label op de
     editor. — S

200. **Het contextmenu van het grid is niet met het toetsenbord te openen of te bedienen.** `CostGrid.tsx:105-111`
     (Shift+F10 op de container → `closest()` geeft null), `GridContextMenu.tsx:264-298`,
     `ColumnHeaderMenu.tsx:37-50`, `SubSheetRowContextMenu.tsx:28` (sluit bij mouseleave, geen Escape). Afgeleid
     uit de code, niet in de app getest. Voorstel: `activeRow` als anker; `role=menu`, pijltjestoetsen en de
     focus teruggeven. — S

201. **Drie kiezers gebruiken geen `Modal`/`useDialogFocus`.** `CostItemPicker.tsx:46-50`,
     `ExcelCellPicker.tsx:145-149` (cellen werken alleen met `onClick`, dus een Excel-koppeling vraagt een muis)
     en `ResourcePicker.tsx:140-151`. Afgeleid uit de code, niet in de app getest. Voorstel: ze op `<Modal>`
     zetten; de cellen focusbaar maken; een listbox voor de resourceregels. — S

202. **Lintkeuzelijsten zijn niet met het toetsenbord bereikbaar en de aan/uit-stand wordt niet voorgelezen.**
     `HomeTab.tsx:288-310` en `:349-376` (in een portal, geen Escape, "▾" zonder label); `RibbonButton.tsx:21`
     (geen `aria-pressed`); `RibbonTab.tsx` (geen `aria-selected`). Afgeleid uit de code, niet in de app
     getest. — S

203. **Labels zijn niet aan hun velden gekoppeld (~40 velden).** `ProjectInfoEditor.tsx:20-70`,
     `OfferteView.tsx:181-198`, `WizardModal.tsx:110-140`, `SettingsDialog.tsx:110-150`, `HomeTab.tsx:455-470`,
     `PropertiesPanel.tsx:159-165`, `StatusBar.tsx:224`. Afgeleid uit de code, niet in de app getest. Voorstel:
     `useId()` + `htmlFor`. — S

204. **Knoppen met alleen een symbool hebben geen goede naam; een tabblad sluiten kan niet met het
     toetsenbord.** `ChatPanel.tsx:262,321`; `FindReplaceDialog.tsx:120-125` (het aantal treffers heeft
     `role=status` nodig); `FileTabBar.tsx:287-294` ("●" wordt voorgelezen als "black circle", sluiten-"×" is een
     span, geen Ctrl+W/Ctrl+F4). Afgeleid uit de code, niet in de app getest. — S

208. **Getalvelden op de telefoon: geen mintoets op iOS, en `1,250` wordt stil gelezen als 1250.**
     `MobileWorkspace.tsx:88, 91, 92` (`inputMode="decimal"`), `numberInput.ts:5`. Afgeleid uit de code.
     Voorstel: `inputMode="text"` met een pattern; het andere scheidingsteken accepteren als het geen
     duizendtalscheiding kan zijn. — S

210. **Een opgeslagen werkruimte die al actief is, kun je niet opnieuw toepassen via de keuzelijst.** Dezelfde
     optie opnieuw kiezen vuurt geen `change` af (`src/components/layout/WorkspaceLayoutBar.tsx:33`). Gezien in
     de code. Voorstel: een actie "Toepassen"/"Herstellen", of de select na elke toepassing terugzetten. — S

213. **Een ingebouwde werkruimte-indeling wist zonder melding verborgen kolommen, rasterweergave en zoom.**
     `workspaceSlice.ts:22`, `:38-40`. Nagespeeld; mogelijk bewust. Voorstel: `gridView`, `hiddenColumns` en
     `gridZoom` buiten de ingebouwde indelingen houden. — B

218. **ResourcePicker, RevisionDialog en PriceUpdateDialog liggen onder andere zwevende UI.**
     `.resource-picker-overlay { z-index: 200 }` (`panels.css:192`, niet geportaled); de chat (1000),
     Backstage (1000), de importwaarschuwingen (9000) en de titelbalk (9999) liggen erboven. Ook opent het
     contextmenu van het grid (1000) onder het paneel met importwaarschuwingen. Gezien in de code. Voorstel: de
     Modal-laag gebruiken (10000, geportaled), en één gedeelde z-index-schaal. — S

220. **RTL: de greep om kolommen te verbreden en het submenu van het contextmenu spiegelen niet.**
     `grid.css:49-56` met `GridHeader.tsx:50` (`diff` wordt niet omgekeerd; GridHeader.tsx wordt op dit moment
     omgebouwd; meenemen bij dat werk), `grid.css:492-494` met `GridContextMenu.tsx:287` (`left: 100%`),
     `grid.css:508` en `Ribbon.css:181-189`. Gezien in de code. Voorstel: logische CSS-eigenschappen, en `diff`
     omkeren in RTL. — S

285. **De valutalijst staat buiten de dialoog (portal), waardoor VoiceOver de opties mogelijk niet voorleest**
     (`CurrencyPicker.tsx`; de dialoog heeft `aria-modal="true"`). Met toetsenbord en muis werkt hij gewoon.
     Gevonden in de review van de valutakeuze. — S

## Prestaties

222. **Rapportvoorbeeld en WPCalc-export bevriezen het venster.** `reports/mod.rs:443-471` en
     `wpcalc_export.rs:556` zijn synchrone `fn`-commands die op de hoofdthread draaien. Voorstel: `async fn` +
     `spawn_blocking`, zoals `save_project_atomic` al doet. — S

223. **Undo-snapshots maken bij elke bewerking een diepe kopie van de hele begroting.** In
     `src/state/slices/historySlice.ts:27`, `:38` en `:51` (`JSON.parse(JSON.stringify(items))`, inclusief de
     wijzigingshistorie per post). Gemeten op een belaste machine (het groeipatroon is betrouwbaar): 1k: 17 ms,
     5k: 70–100 ms, 20k: 490–680 ms per commit; 50 snapshots bij 20k ≈ +174 MB heap. Ernstig. Voorstel: de
     `items`-referentie bewaren (de array wordt als immutable behandeld; eerst controleren op mutaties ter
     plekke). — B

224. **Bulkacties herberekenen de hele begroting één keer per regel.** Lussen die `updateItem`/`deleteItem`
     aanroepen in `useGridNavigation.ts:196-203`, `useKeyboardShortcuts.ts:107-109`,
     `GridContextMenu.tsx:123-124,207-209`, `FindReplaceDialog.tsx:98-101`, `useQuantityLinkSync.ts:38-39`,
     TekstopmaakTab en `useGridEditing.ts:79-82`. Gemeten op een belaste machine: 50 regels verwijderen bij 20k
     ≈ 11 s; 50 cellen leegmaken ≈ 27 s (ook zonder de belasting minstens zo'n 4,5 s). Voorstel:
     `updateItems(patches[])` / `deleteItems(ids[])` met één herberekening. — B

226. **Scrollen of de cursor verplaatsen rendert de hele app opnieuw en bouwt de rijenlijst opnieuw op.**
     `useAppStore()` zonder selector in `App.tsx:136`, `useKeyboardShortcuts.ts:21-25`, `HomeTab.tsx:29`,
     `CostGrid.tsx:37-60`, `StatusBar.tsx:197` en andere; `scrollTop` wordt bij elk scroll-event in de store
     geschreven; `HomeTab.tsx:132` roept de niet-gecachete `getGridRows()` aan (20k ≈ 59 ms, gemeten op een
     belaste machine). Voorstel: smalle selectors / `useShallow`, `scrollTop` lokaal in het grid, `getGridRows`
     cachen, `useMemo` voor het eindtotaal. — B (`getGridRows` gemeten), S (re-renders)

227. **Elke bewerking heeft een hoge basiskost.** `recalculateItems` bij 20k: 56–128 ms (gemeten op een belaste
     machine), inclusief `normalizeItemOrder` bij elke aanroep. Voorstel: de volgorde alleen normaliseren bij
     structuurwijzigingen. — B

## Teksten, vertalingen en documentatie

233. **"Wat is er nieuw" toont de releases vanaf 2026.45.0 alleen in het Engels.** De gebundelde lijst in
     `ReleaseNotesPanel.tsx` loopt inmiddels tot de huidige versie (bewaakt door
     `src/test/bundledReleaseNotes.test.ts`), maar `src/i18n/locales/*/releases.json` heeft geen `names`/
     `highlights` voor v2026.45.0 en later, dus elke taal toont daar de Engelse titel en tekst. Bij 44.0 staat
     nog "acceptance pending" (niet nagegaan of dat nog klopt); offline- en hosted-gebruikers zien alleen deze
     lijst. — B

299. **De lijst cloudbestanden toont datum en tijd altijd in Nederlandse notatie.**
     `src/components/backstage/CloudPanel.tsx:123-124` (`toLocaleDateString('nl-NL')`,
     `toLocaleTimeString('nl-NL')`). Gezien in de code, bij de fix van knownbug 228 (zelfde fout in
     `OfferteTab.tsx`). Voorstel: `i18n.language` gebruiken, zoals `PriceLibraryPanel.tsx:102`. — S

300. **De offerteknop `ribbon:offerte.termijnen` zegt in veel talen "voorwaarden" in plaats van betaaltermijnen.**
     EN "Terms", MS "Terma", BN, EL, HI, HU, TA en TR ook "voorwaarden/condities"; CS/SK "Termíny" betekent
     eerder data of deadlines. De knop opent de betalingstermijnen (`__termijnen`). Gezien in de vertalingen bij
     de fix van knownbug 245 (DE/PL). Voorstel: per taal het woord van
     `common:workspace.quotationDefaults.payments` gebruiken (EN "Payment schedule"). — S

## Wensen en open taken (geen bug)

262. **De tabel kan geen tekst uit Excel of Sheets plakken.** Ctrl+V plakt alleen regels die binnen de app zijn
     gekopieerd. — S

265. **Een gekoppeld totaal houdt zijn oude waarde als de laatste meting weg is.** `pdfWorkspace.ts:40` en
     `src/hooks/useQuantityLinkSync.ts:37` (`null` wordt genegeerd). Nagespeeld, maar waarschijnlijk bedoeld:
     het is gedocumenteerd (laatste waarde blijft staan, met een ⚠-tooltip). Alleen dat `sum-*` dan niet naar 0
     gaat, is discutabel. Voorstel: geef 0 terug voor `sum-*`-koppelingen als er geen metingen meer zijn. — B

266. **Eenheid van 'uur' af laat de automatisch ingevulde tariefgroep, norm en arbeid staan.** Mogelijk
     bewust. Nagespeeld. Voorstel: de automatisch ingevulde velden terugdraaien, of in elk geval de tariefgroep
     leegmaken. — B
