# Open Calc Studio — aankomende release

## 2026.44.0: Blueprint, wizard en gehost gebruik

De ontwikkeltak volgt nu OpenAEC Blueprint met vijf thema's en lokaal
meegeleverde fonts. Nieuw zijn een optionele calculatiewizard, versievaste
hostopslag voor SuperCloud en een onafhankelijke REST/HTTP-MCP-rekenservice.
De productpakketten gebruiken hetzelfde jaar.ISOweek.patch-versienummer.
Zie [de ontwikkelreleasenotes](v2026.44.0.md) en
[de issue-/acceptatiematrix](../issue-readiness.md) voor wat is gebouwd,
getest en nog moet worden geverifieerd.

## Mobiele webapp voor Android en iPhone

Open Calc Studio heeft een compacte telefoonweergave waarin je dezelfde `.ifcCalc`-begroting als op de desktop kunt aanpassen. Hoofdstukken, begrotingsposten en rekenregels zijn als kaarten te zoeken en te bewerken; hoeveelheden, eenheden, prijzen, productienormen en notities rekenen mee met de bestaande calculatiemotor. Ook deelbladcellen en Prompt & Begroot zijn bereikbaar.

Je kunt een project uit de bestandsapp openen en met **Opslaan** als nieuw `.ifcCalc`-bestand downloaden. Het laatste actieve project wordt lokaal als concept hersteld na opnieuw openen van de browser. Voor een overdraagbare kopie blijft handmatig opslaan nodig.

De webbuild bevat een manifest en pictogrammen voor het beginscherm. Voor gebruik op een telefoon moet de build via HTTPS worden aangeboden. Rapportopmaak, IFC/3D en PDF-metingen blijven voorlopig in de desktopweergave. Zie de [mobiele handleiding](../mobiele-webapp.md).

Dit is een concept voor de volgende release; v0.13.0 bevat deze functie niet.
De resterende acceptatiecriteria staan in [feature-issue #25](https://github.com/OpenAEC-Foundation/open-calc-studio/issues/25).
