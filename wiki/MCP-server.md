# MCP-server

De Model Context Protocol-server van Open Calc Studio laat een MCP-client een begroting openen, regels toevoegen en aanpassen, berekeningen uitvoeren en geselecteerde bestanden uitwisselen. De `app_*`-tools bedienen de draaiende desktopapp, inclusief PDF-metingen en IFC-Lite. `app_list_actions` geeft 202 store-acties plus bestands- en vieweropdrachten. Gebruik deze tools voor live bediening; de oudere tools zonder dit voorvoegsel werken op een afzonderlijk document in het MCP-proces. Zie de [complete MCP-handleiding](https://github.com/OpenAEC-Foundation/open-calc-studio/blob/main/docs/mcp-desktop.md).

## Instellen

Installeer Node.js. Bij het starten van de desktopapp wordt de gebundelde MCP-server opgeslagen in een blijvende gebruikersmap en schrijft de app `~/.claude/open-calc-studio-mcp.json`. Controleer daar de paden naar Node en `ocs-mcp-…mjs`. Voeg die serverconfiguratie toe aan je MCP-client als die het bestand niet automatisch ontdekt. Start de MCP-client daarna opnieuw.

Ontwikkelaars kunnen de server ook vanuit de broncode starten; zie de [technische MCP-handleiding](https://github.com/OpenAEC-Foundation/open-calc-studio/blob/main/mcp-server/README.md).

## Begroting uitwisselen

1. Gebruik `open_budget` met een absoluut pad naar een native begroting of ondersteund uitwisselbestand.
2. Controleer de teruggegeven waarschuwingen, structuur en totalen.
3. Bewaar een geïmporteerd bestand met `save_budget` onder een **nieuw** `.ifcCalc`-pad. De bron wordt niet automatisch overschreven.
4. Gebruik desgewenst `export_exchange_file` voor een nieuw BC3-, ONLV-, CUF-, TRADXML- of RSX-bestand. Een bestaand uitvoerbestand wordt niet overschreven.

Voor een Duitse aanbieding: open eerst het passende GAEB X83-bestek met `open_budget`, voer dan `apply_gaeb_x84` uit met het X84-bestand en controleer de gewijzigde prijzen. Pas daarna bewaar je het project als native bestand. Bij een ontbrekend of dubbel positienummer worden geen gedeeltelijke wijzigingen toegepast.

## Huidige grenzen

- GAEB-export is nog niet beschikbaar; import bewaart niet elk GAEB-veld.
- PDF-metingen en IFC-quantitysets zijn via `pdf.*` en `ifc.*` in `app_action` beschikbaar. Ze vereisen de draaiende desktopapp.
- SIA 451/CRBX, DCF/XPWE en OST/OSP worden niet ondersteund.
- Een MCP-actie op een open desktopbegroting kan gevolgen hebben voor die sessie. Bewaar belangrijk werk voordat je externe automatisering gebruikt.

Meld ontbrekende functies of problemen via de [issues](https://github.com/OpenAEC-Foundation/open-calc-studio/issues), liefst met een geanonimiseerd voorbeeldbestand en het verwachte resultaat.
