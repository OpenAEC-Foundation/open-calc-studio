# Open Calc Studio — aankomende release

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
