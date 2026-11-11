# Open Calc Studio — releasehistorie en voorbereiding

Volledige release-informatie: [2026.46.0](v2026.46.0.md).

## 2026.46.0: structuurboom

- Het paneel **Structuur** links is een echte boom geworden: hoofdstukken,
  paragrafen, begrotingsposten, bewakingsposten en regels, in en uit te klappen
  samen met het raster. Kies de diepte (Hoofdstukken, Begrotingsposten of alles).
  Een klik op een rij springt in het raster naar die rij, en andersom.
- **Slepen:** versleep hoofdstukken, paragrafen, posten en regels. Een rij houdt
  zijn niveau: een hoofdstuk wordt nooit ongemerkt een paragraaf. Een dichte map
  gaat na een halve seconde open als je erboven blijft hangen (boven het pijltje
  bijna meteen), en Escape breekt het slepen af. Elke zet is één ongedaan-stap.
- **Rechtermuisknop (of Shift+F10):** Omhoog/Omlaag (Alt+↑/↓), **Verplaats naar**,
  **Maak paragraaf van** en **Maak hoofdstuk**, alles eronder in- of uitklappen,
  en Verwijderen (altijd met een vraag). Een grijze optie zegt in een tooltip
  waarom hij nu niet kan.
- **Weergave:** zet het Nr (de plek, zoals de kolom Nr), de eigen Code of niets
  vóór de omschrijving. Bedragen staan rechts, desgewenst met **% van totaal**;
  het % verschijnt alleen als het paneel breed genoeg is.
- Ook bij grote begrotingen (duizenden regels) tekent de boom alleen de rijen
  die veranderen.

## 2026.46.0: verplaatsen en selectie in het raster

- Een rij verplaatsen (slepen in het raster, of via de AI-koppeling) verandert
  alleen nog de plek van die rij. In geïmporteerde begrotingen konden eerder ook
  rijen in andere hoofdstukken van volgorde wisselen.
- Na het verplaatsen blijft de selectie op de verplaatste rijen staan. Eerder
  stond hij op de rijen die nu op die regelnummers stonden, zodat een Delete
  direct na het slepen andere rijen kon raken.
- Na in- of uitklappen (pijltje, Inklappen tot niveau, bewakingsposten) vervalt
  een selectie van meerdere rijen; de actieve cel blijft op zijn rij, of op het
  ingeklapte hoofdstuk als die rij nu verborgen is.
- Slepen naar dezelfde plek maakt geen ongedaan-stap meer en markeert de
  begroting niet als gewijzigd.

## 2026.46.0: arbeid met productiecapaciteit

- **Let op: bedragen kunnen dalen.** Op een regel met een tariefgroep deelt de
  productiecapaciteit (pcap) nu ook het loon, zoals hij de uren al deelde: 10 m²
  × norm 1 ÷ capaciteit 2 = 5 uur × € 64 = € 320 (was € 640). Bestaande
  begrotingen met zo'n regel (tariefgroep én capaciteit anders dan 1) krijgen bij
  het openen een lager arbeidsbedrag. Regels met capaciteit 1 of leeg, regels met
  een direct ingevuld uurloon en het UI-1-model veranderen niet.
- De WpCalc-export en de urenkolom in de Bouw 1- en IBIS-rapporten rekenen met
  dezelfde deling, zodat ze hetzelfde bedrag en dezelfde uren tonen als de app.

## 2026.46.0: SuperCloud-tools op de desktop

- `npm run build:platform` levert `mcp-tools.json` naast de bundel: de
  definities van de negen `calc_*`-tools van `window.__OPDS_APP__`, gelijk aan
  `siteAppTools.json`, zodat de host ze zonder draaiende app kan controleren.
- De desktop-MCP-server biedt dezelfde `calc_*`-tools onder dezelfde namen aan,
  naast de `app_*`-tools en de oudere tools zonder voorvoegsel. Ze lopen via
  het app-commando `calc.tool` door dezelfde code als in de browser; export,
  herstel en tweede scherm worden op de desktop niet geweigerd.
- De knop **Tweede scherm** is verborgen in een afgeschermd frame zonder eigen
  origin (de SuperCloud-werkplek) en in de ingebouwde weergave, waar hij niet
  kan werken. Op de desktop, in de gewone webversie en op een gewone hostpagina
  blijft hij staan.
- Het herstelscript voor het opstarten staat niet meer inline in `index.html`
  maar in `startup-recovery.js` naast de bundel, zodat een gehoste pagina met een
  strikte CSP zonder `unsafe-inline` (de SuperCloud-werkplek) zonder CSP-fout start.
- Bewaart de site een opslag als conflictkopie omdat iemand anders intussen een
  nieuwere versie opsloeg, dan meldt de app nu de naam van die kopie (eerder
  veranderde alleen de naam van het tabblad), en dat opslaan vanaf nu naar die
  kopie gaat. Weigert de site de opslag (`VERSION_CONFLICT`), dan zegt een vertaalde
  melding dat er niets is opgeslagen, dat de wijzigingen nog in de app staan en dat
  Opslaan als ze bewaart.
- `npm run verify:werkplek` bootst de SuperCloud-werkplek lokaal na (strikte CSP,
  afgeschermd frame, brug naar een nep-host die de regels van `openaec-storage`
  volgt) en voert 20 controles uit op de platformbuild.
- De web- en gehoste versie proberen geen Tauri-koppelingen voor bestandskoppeling
  en slepen meer te starten; de twee waarschuwingen in de console zijn weg.

## 2026.45.1: nieuw logo en compacte schermindeling

- Het goedgekeurde amber euroteken op antraciet met afgeronde transparante
  hoeken wordt gebruikt in de app, browser, PWA en desktopinstallers.
- Compacte kop, inklapbare zijbalk, scrollbaar lint en aangepaste dialogen
  maken de interface bruikbaarder op kleine laptopschermen.
- De eigenschappenpaneelvoorkeur wordt onthouden; zoompresets zijn ook via
  de interfacezoom bereikbaar. Rapporthoeveelheden en rasterkolommen hebben
  onafhankelijke weergaveopties.
- Duitse interfaceteksten zijn bijgewerkt en Lao is als taal toegevoegd.
- Productversie 2026.45.1; MSI 26.45.1; bestandsformaat blijft 2.4.0.

## 2026.45.0: Excel-import, platformassistent en accountcontrole

- Algemene Excel-bestanden openen met een kolomkoppelvenster wanneer ze geen
  BasCalc-bestand zijn. Spaanse kolommen, materieel en hiërarchische codes worden
  ondersteund. De veldlabels zijn vertaald; annuleren geeft geen importfout.
- De platformassistent krijgt het browserkoppelvlak `window.__OPDS_APP__`.
  Hostinstellingen blijven via de site bewaard en geïmporteerde bestanden worden
  als nieuwe `.ifcCalc` opgeslagen. Desktopacties die browseropslag of native
  export nodig hebben blijven beschermd.
- Feedback gebruikt geen CORS-blokkerende User-Agent-header meer. Het formulier
  verklaart ontbrekende velden en biedt bij fouten een e-mailalternatief.
- GAEB-aanbiedingsmeldingen volgen de gekozen taal.
- Accounts worden alleen in een expliciet ingeschakelde native build aangeboden.
  Ontbrekende of ongeldige accountconfiguratie geeft direct uitleg; er is geen
  terugval meer op ontwikkelservers. Linux en macOS gebruiken hun eigen
  keyringbackend. Netwerkverzoeken hebben een deadline en tokenfouten worden
  op HTTP-status gecontroleerd.
- De zelfstandige productielogin is nog niet bewezen met een geregistreerde
  productieclient op alle drie platforms; issue #42 blijft daarom open.
- Productversie 2026.45.0; MSI 26.45.0; bestandsformaat blijft 2.4.0.

## 2026.44.6: herstel, prijsbronnen en revisiecontrole

- Herstelopslag via IndexedDB bewaart alle open documenten en snapshots wanneer
  er gewijzigd werk is. Opslagfouten zijn zichtbaar. Herstellen opent nieuwe
  begrotingen en overschrijft geen oorspronkelijke bestanden. De 3D-geometrie
  vraagt na herstart nog het oorspronkelijke IFC-bestand.
- Native opslaan gebruikt een tijdelijk bestand, bewaart de vorige versie als
  `.bak` en behoudt nieuwe edits tijdens een lopende schrijfactie. Bij sluiten
  worden alle gewijzigde documenten behandeld; autosave volgt de instellingen.
- Catalogusartikelen hebben vaste ID's. Toegepaste prijzen bewaren hun bron,
  peildatum, versie en valuta. De eigenschappen tonen die prijsherkomst.
- Het Controlecentrum biedt een prijsupdatepreview met hoofdstuk-/totaaleffect,
  expliciete regelselectie en undo. Eigen prijzen, tariefgroepen, afwijkende
  eenheden/valuta en inactieve varianten worden beschermd.
- Bronrevisies vergelijken koppelt IFC-objecten via unieke GlobalIds en dezelfde
  hoeveelheidssleutel. Beoordeelde hoeveelheidskoppelingen zijn selectief toe
  te passen en terug te draaien. PDF-metingen en kalibratie blijven handmatig
  te beoordelen; geometrische overlays zijn geen onderdeel van deze vergelijking.
- PDF-meetimport weigert een verkeerde bronhash. Oudere exports zonder hash
  vragen expliciete bevestiging en krijgen een zichtbare controlemelding.
- SheetJS 0.20.3 wordt uit de officiële, vastgelegde tarball gebouwd; PDF.js
  is bijgewerkt naar 6.4.299. Ongebruikte ThatOpen-afhankelijkheden zijn verwijderd.
  Spreadsheetimport heeft grootte-/ZIP-/celgrenzen en de UI gebruikt een worker
  met een deadline van 30 seconden. App en MCP zijn apart geaudit en getest.
- Prijsupdates, revisies en herstel zijn ook via de desktop-MCP-acties beschikbaar;
  de library exporteert de pure prijs- en IFC-vergelijkingsfuncties.
- Productversie 2026.44.6, MSI 26.44.6; optionele bronvelden in bestandsformaat 2.4.0.

## 2026.44.5: SuperCloud, containers en releasevoorbereiding

- Gehoste sessies volgen taal en thema van `openaecHost` (`locale`/`theme` of
  `taal`/`thema`), ook bij late injectie en voorkeurwijzigingen. De eigen
  titelbalk vervalt in gehoste en ingebouwde weergave.
- Grafische Docker-runtime voorbereid vanuit het bestaande Linux-DEB:
  één fullscreen app, geen root/FUSE/GPU, `/openaec` en `/config`, gezondheid
  op `/gezond`, privé-MCP op poort 9743 en controles vóór publicatie.
  De [containerproef](https://github.com/OpenAEC-Foundation/open-calc-studio/actions/runs/41041765193)
  slaagt zonder netwerk, inclusief stream, MCP en crashdetectie. De volledige
  container gebruikt in rust 255,7 MiB op de GitHub Linux-runner (geen bestand
  geopend). De eerste publieke imagepublicatie is nog niet uitgevoerd.
- De volledige MCP-server ondersteunt optioneel stateful HTTP met echte
  SDK-sessies, Bearer-authenticatie, aanvraaglimiet en browser-originweigering.
  Stdio blijft de standaard. Native containerdialogen starten in `/openaec`;
  externe accounts, releaseverzoeken, feedback en analytics blijven uit.
- De updater-signingaanvulling uit PR #34 is geïntegreerd; ook het macOS
  updaterarchief en zijn handtekening worden verzameld. Release-signingbewijs
  blijft per platform en werkelijk aangeboden artifact nodig.
- Klein native DynLex-prototype uitgevoerd met vijf vergelijkingen tegen de
  bestaande kern. Dit is geen herschrijving of aangetoonde prestatiewinst.
- Productversie 2026.44.5, MSI 26.44.5; bestandsformaat blijft 2.3.0.

## 2026.44.4: knopcontrole en herstel

- Licentieteksten zijn ook rechtstreeks in de hoofdmap van het npm-inbouwpakket
  beschikbaar als `LICENSE`, `COPYING` en `NOTICE.md`. De Blueprint-bronvermelding
  verwijst naar de daadwerkelijk gebruikte commit.
- Kopiëren, knippen en verwijderen in het lint volgen de volledige selectie,
  ook als het selectie-eindpunt een berekende hoofdstukfooter is. Kopiëren en
  knippen nemen onderliggende rekenregels mee bij ingeklapte posten.
- Knoppen zonder geldig doel worden uitgeschakeld: bewakingspost zonder
  bovenliggende begrotingspost, opmaak zonder actief rekenblad, ongeldige
  prijsschaalfactor en bronselecties zonder gegevens. Een ontbrekende cel
  wordt niet langer als een fictieve nulhoeveelheid gekoppeld.
- Zoeken opent ingeklapte ouders zonder de begroting als gewijzigd te markeren.
  Wijzigingen aan offerte, rekenblad, varianten en projectkengetallen krijgen
  juist wel de wijzigingsstatus, zodat sluiten niet stilzwijgend data verliest.
- Opslaan bij sluiten van een inactief tabblad bewaart dat tabblad. Een
  tweede venster krijgt de gekozen begroting en bijbehorende bedrijfsgegevens.
- Afdrukken, PDF-export en MCP gebruiken dezelfde PDF-generator en gekozen
  rapportopties, inclusief voorblad en samenvatting. IBIS/directie-afdrukken
  gebruiken de juiste generator en het tijdelijke pad van het besturingssysteem.
- Offerte afdrukken werkt in de desktopapp; browserknoppen tonen de
  desktopvereiste. PDF-fouten worden zichtbaar gemeld. Wisselen van document
  tijdens een opslaan-dialoog leidt niet tot export van de verkeerde begroting.
- Zoompresets reageren ook op toetsenbordactivering. De twee lege
  instellingentabbladen Raster/Bestanden zijn verwijderd. Afsluiten is in
  de browser uitgeschakeld; decoratieve linticonen zijn verborgen voor
  schermlezers. Ook oudere dialoogknoppen houden een eigen sneltoetscontext.
- Automatische knoptests gebruiken echte React-componenten en de echte
  applicatiestore met geïsoleerde bestands-, netwerk- en vensteradapters.
  Er is geen echte feedback verstuurd en geen cloudaccount gewijzigd.
  GPU-weergave, native bestandsdialogen, fysieke printers en live browser-
  bediening vereisen aanvullende controle in een bestuurbare omgeving.
- Productversie 2026.44.4, MSI 26.44.4; bestandsformaat blijft 2.3.0.

## 2026.44.3: invoer herstellen en efficiënter werken

- Mobiel bewaart expliciete nulprijzen, verwerkt getallen volgens de
  interfacetaal en toont de projectvaluta. Bewerkingen en verwijderen krijgen
  één undo-stap; de kop bevat knoppen voor ongedaan maken en opnieuw uitvoeren.
- Gekoppelde hoeveelheden en eenheden zijn alleen-lezen. Kies **Hoeveelheid
  ontkoppelen**, voer de handmatige waarde in en bevestig met **Gereed**.
  Annuleren behoudt de koppeling; undo herstelt de oude koppeling en waarde.
- Mobiele lijst, wizard, raster en controlecentrum gebruiken dezelfde actieve
  variantselectie. De financiële rekenregels blijven ongewijzigd.
- Delete, knippen, plakken en nieuwe regels via het toetsenbord vereisen focus
  in het raster. Tekstvelden behouden hun eigen undo; dialogen hebben hun
  eigen toetsenbordcontext.
- De wizard toont een foutoverzicht met **Ga naar ongeldig veld** en
  **Ongeldige invoer verwijderen**. Ongeldige concepten bewaren de laatst
  geldige financiële waarde. De volledige editor blijft bereikbaar.
  Nulprijzen tellen in de wizard en het controlecentrum als ingevuld.
- Gedeelde dialogen en mobiele bewerkvensters hebben een naam, focusbeheer,
  Tab-begrenzing, Escape en focusterugkeer, ook bij geneste dialogen.
- IFC: 100 elementen per pagina, resultaat- en modelaantallen, vorige/volgende
  pagina en **Alle resultaten selecteren** over alle pagina's. MCP:
  `ifc.selectFiltered {search?: string}`; bestaande `ifc.select` wist de
  selectie met `elementIds: []`.
- PDF-broncontrole indexeert de workspace één keer per controle,
  in plaats van alle metingen opnieuw per begrotingsregel te doorlopen.
- De eigen zwevende assistent wordt verborgen in de ingebouwde/hostomgeving,
  ook wanneer de SuperCloud-host pas na het opstarten wordt gekoppeld.
- Productversie 2026.44.3, MSI 26.44.3. Bestandsformaat blijft 2.3.0.

## 2026.44.2: controlecentrum

- Nieuwe ingang **Controlecentrum** met actuele meldingenteller in de
  linkerzijbalk. Op mobiel staat **Controle** in de onderste navigatie.
- Filter ontbrekende prijsinvoer, bronproblemen en afwijkende eenheden;
  inspecteer een melding en ga naar de exacte begrotingsregel. Ingeklapte
  ouders worden geopend. Terugkeren bewaart de categorie en melding.
- Controles omvatten de actieve variant. Expliciete nulprijzen zijn geldig;
  tekst, pro-memoria en opgetelde bovenliggende regels worden niet onterecht
  als ongeprijsd gemeld. Externe Excel-verwijzingen zijn niet geverifieerd;
  opgeslagen IFC-hoeveelheden vereisen geen geladen geometrie.
- Inspectie behoudt financiële waarden, wijzigingsstatus en undo. Opgeloste
  meldingen verdwijnen automatisch. Dit is geen volledigheidsverklaring
  of toets van marktprijzen.
- MCP: `review.list`, `review.open`, `review.openItem`; ook beschikbaar als
  pure SDK-functie `reviewBudget`. 211 JSON-aanroepbare store-acties.
- Productversie 2026.44.2, MSI 26.44.2. Bestandsformaat blijft 2.3.0;
  de controlecontext wordt niet in het project opgeslagen.

## 2026.44.1: werkplekken, herkomst en financiële voorstellen

- Kies Meten, Begroten of Controleren onder de projectkop. Bewaar eigen
  indelingen met paneelbreedten, zichtbare kolommen, rasterzoom en PDF-zoom.
  De laatst gekozen werkplek wordt bij de volgende start hersteld.
- Tweede scherm opent een gesynchroniseerd, alleen-lezen venster voor
  PDF-tekeningen of de herkomst van de geselecteerde hoeveelheid. Plaats het
  venster op de gewenste monitor. Bewerk de begroting in het hoofdvenster.
  Ingebouwde frames ondersteunen dit extra venster niet.
- De herkomstkaart toont PDF-bestand en pagina, IFC-model en elementselectie,
  of rekenbladcel en formule. Bronidentiteit en koppelwaarde blijven in het
  project bewaard. Ontbrekende bronnen behouden de laatst bekende hoeveelheid;
  afwijkende eenheden krijgen een waarschuwing. Externe Excel-bestanden worden
  als niet-gecontroleerde verwijzing getoond.
- Assistentvoorstellen tonen directe kosten, totaal exclusief btw, btw en
  totaal inclusief btw vóór en na de wijziging, plus gewijzigde regels en
  aannames. Voorbereiden verandert de begroting niet. Goedkeuren publiceert
  de hele wijziging met één undo-stap; verouderde voorstellen worden geweigerd.
  Een verwijdering mag latere verwijzingen niet naar een hernummerde buurregel
  omleiden. Gekoppelde hoeveelheden kunnen niet door een voorstel worden overschreven.
- Nieuwe MCP-acties maken dezelfde werkplekken, bronkaarten en
  voorbereiden/goedkeuren/ongedaan-maken-werkwijze beschikbaar.
- Productversie 2026.44.1, MSI 26.44.1; additief native bestandsformaat 2.3.0
  voor optionele `quantityOrigin`-gegevens. Oudere projecten blijven leesbaar.

## 2026.44.0: Blueprint, wizard en gehost gebruik

De ontwikkeltak volgt nu OpenAEC Blueprint met vijf thema's en lokaal
meegeleverde fonts. Nieuw zijn een optionele calculatiewizard, versievaste
hostopslag voor SuperCloud en een onafhankelijke REST/HTTP-MCP-rekenservice.
De productpakketten gebruiken hetzelfde jaar.ISOweek.patch-versienummer.
Zie [de ontwikkelreleasenotes](v2026.44.0.md) en
[de issue-/acceptatiematrix](../issue-readiness.md) voor wat is gebouwd,
getest en nog moet worden geverifieerd.

## Vollediger vertaald naar Engels en Nederlands

PDF-metingen, de IFC-splitsweergave, Prompt & Begroot, de prijsbibliotheek, assistentvoorstellen en fout-/importmeldingen volgen nu de gekozen interfacetaal. Nieuwe begrotingen en offertes krijgen vertaalde standaardteksten. De assistent antwoordt in de gekozen taal en begrijpt ook het Engelse voorbeeldcommando. Bestaande documentinhoud wordt niet automatisch herschreven.

## Mobiele webapp voor Android en iPhone

Open Calc Studio heeft een compacte telefoonweergave waarin je dezelfde `.ifcCalc`-begroting als op de desktop kunt aanpassen. Hoofdstukken, begrotingsposten en rekenregels zijn als kaarten te zoeken en te bewerken; hoeveelheden, eenheden, prijzen, productienormen en notities rekenen mee met de bestaande calculatiemotor. Ook deelbladcellen en Prompt & Begroot zijn bereikbaar.

Je kunt een project uit de bestandsapp openen en met **Opslaan** als nieuw `.ifcCalc`-bestand downloaden. Het laatste actieve project wordt lokaal als concept hersteld na opnieuw openen van de browser. Voor een overdraagbare kopie blijft handmatig opslaan nodig.

De webbuild bevat een manifest en pictogrammen voor het beginscherm. Voor gebruik op een telefoon moet de build via HTTPS worden aangeboden. Rapportopmaak, IFC/3D en PDF-metingen blijven voorlopig in de desktopweergave. Zie de [mobiele handleiding](../mobiele-webapp.md).

Dit is een concept voor de volgende release; v0.13.0 bevat deze functie niet.
De resterende acceptatiecriteria staan in [feature-issue #25](https://github.com/OpenAEC-Foundation/open-calc-studio/issues/25).
