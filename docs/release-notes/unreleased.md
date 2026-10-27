# Open Calc Studio — aankomende release

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
