# PDF-metingen bewaren en Open PDF Studio koppelen

## In Open Calc Studio

1. Open een begroting en kies onderaan **PDF & metingen**.
2. Kies **PDF toevoegen**. De PDF wordt in de begroting opgenomen (maximaal 30 MB per PDF). Meerdere tekeningen zijn mogelijk.
3. Kies **Schaal kalibreren**, klik twee punten met een bekende afstand, kies **Meting afronden** en vul de werkelijke afstand in meter in.
4. Kies **Lengte** of **Oppervlakte**, klik de meetpunten en kies **Meting afronden**. Kalibratie geldt per pagina. Opnieuw kalibreren berekent eigen metingen op die pagina opnieuw.
5. Sla de begroting op met Ctrl+S. De PDF, meetpunten, schaal en waarden staan in `schedule.pdfWorkspace` in het native `.ifcCalc`/`.ocs`-bestand. Ze zijn niet afhankelijk van de viewer of van een lokaal PDF-pad.
6. Koppel een hoeveelheid via de bestaande hoeveelhedenkiezer, tab **PDF**. Een losse meting of het totaal van alle lengtes/oppervlaktes in deze begroting kan als bron dienen.

Meetpunten worden bij zoom 1 opgeslagen en op de actuele zoom getekend. Zoomen verandert de geometrie of de berekende hoeveelheid niet. Wisselen tussen begrotingen wisselt ook de beschikbare PDF-metingen. Als een gekoppelde bronmeting ontbreekt, blijft de laatst bekende hoeveelheid behouden en toont de hoeveelheidscel een waarschuwing. Dit geldt ook wanneer alle metingen van een gekoppelde PDF-som verdwijnen; de hoeveelheid wordt dan niet stilzwijgend nul.

Een losse gekoppelde meting die later wordt verwijderd behoudt haar laatst bekende hoeveelheid. Een gekoppeld totaal verandert wel. Controleer zulke posten na het verwijderen of vervangen van metingen.

## In Open PDF Studio

De extensie staat in `integrations/open-pdf-studio`. Het `.oppx`-pakket bevat `plugin.json` en `index.js` aan de root. De extensie gebruikt de bestaande host-API van Open PDF Studio v2026.39 (`getAnnotations` en `getPageCount`). Ze wijzigt de PDF niet.

1. Installeer **Open Calc — metingen** via Extensies, of heropen de app wanneer de extensie al in de lokale pluginmap is geplaatst. Bewaar eerst geopend werk voordat je de app sluit.
2. Meet en kalibreer in Open PDF Studio en sla de PDF zelf daar op.
3. Klap linksonder **Open Calc — metingen exporteren** open. Vul de exacte PDF-bestandsnaam in, bijvoorbeeld `begane-grond.pdf`.
4. Controleer de schaal en tekening, bevestig het controlevakje en klik **Metingen naar Open Calc**. Kies een JSON-bestand in het opslagvenster.
5. Voeg dezelfde PDF in Open Calc Studio toe of selecteer de bestaande bron. Kies **Importeer Open PDF-metingen** en selecteer de export. Controleer dat tekening én revisie overeenkomen; de bestandsnaam alleen bewijst dat niet.
6. Sla de begroting op. Bij een latere export/import worden de eerdere externe metingen voor die bron vervangen. Identieke annotatie-ID's behouden hun hoeveelhedenkoppelingen. Eigen Calc-metingen blijven staan.

De koppeling neemt de waarden van afstand, omtrek en oppervlakte over. Millimeters, centimeters, meters, inches en feet worden naar meter/m² omgerekend. Een handmatige schaal op een afstandsmaat wordt toegepast op de oorspronkelijke eindpunten, zodat de overgenomen hoeveelheid bij de weergegeven maat hoort. Open PDF Studio berekent uitsparingen en bogen; Open Calc herberekent die geometrie niet en bewaart de oorspronkelijke annotatie als broninformatie. Externe contouren worden in deze versie niet over de Calc-viewer getekend.

Dit is een expliciete bestandsuitwisseling tussen de twee apps, geen continue liveverbinding of ingebedde volledige Open PDF Studio. Exporteer en importeer opnieuw na wijzigingen. Lege exports verwijderen de eerdere externe meetlijst na bevestiging. Export/import met onbekende eenheden, dubbele IDs of ongeldige pagina's wordt geweigerd.

## Bestanden en compatibiliteit

- De opgeslagen workspace heeft schema `version: 1` binnen `CostSchedule.pdfWorkspace`.
- Een PDF-bron heeft een SHA-256-ID, bestandsnaam, base64-inhoud, paginaschalen en meetlijst.
- Externe meet-ID's combineren de PDF-bron-ID en Open PDF-annotatie-ID.
- Een andere PDF-versie heeft andere bytes en wordt bij toevoegen een aparte bron. Koppelingen tussen verschillende PDF-revisies worden niet automatisch omgezet.
- Het toevoegen van PDF-inhoud vergroot de begrotingsbestanden. Bewaar een kopie voordat je ze in oudere apps bewerkt: die kennen deze nieuwe gegevens mogelijk niet.
- De exportextensie en Calc-import voeren geen netwerkverkeer uit.

## Controle

De tests in `pdfWorkspace.test.ts` controleren native opslag/heropenen, isolatie tussen begrotingen, bron-ID's bij herimport, eenheidsconversie, foutieve import en gekalibreerde geometrie. De interactieve werking van de Open PDF Studio-extensie moet aanvullend in de desktopapp worden gecontroleerd.
