# Internationale bestandsuitwisseling

Open Calc Studio leest momenteel native projecten, Nederlandse CUF/RAW/IBIS,
Spaanse BC3, Oostenrijkse ÖNORM A 2063 en een afgebakend deel van Duitse GAEB
DA XML. CSV/Excel kan via kolomtoewijzing worden geïmporteerd. PDF en IFC zijn
bronnen voor metingen en hoeveelheden; zij zijn niet automatisch een volledige
begroting met bewerkbare prijsopbouw.

## GAEB DA XML

Importeer een `.x83`-bestek via **Importeren → GAEB DA XML**. De import leest
hoofdstukken, posten, omschrijving, eenheid, hoeveelheid en eventueel
eenheidsprijs. Een `.x84` is meestal slechts een aanbieding met prijzen:
importeer eerst het bijbehorende X83-bestek en kies daarna **GAEB-aanbieding
(.x84)** om de prijzen op exact overeenkomende positienummers toe te passen.
Ontbrekende of dubbele positienummers veroorzaken een fout voordat iets wijzigt.
Bewaar het oorspronkelijke GAEB-bestand: bijlagen, alternatieven en sommige
vrije tekstvelden worden niet volledig meegenomen. Een GAEB-export is nog niet
beschikbaar; de importer is niet BVBS-gecertificeerd.

De MCP-server biedt dezelfde volgorde via `open_budget` en `apply_gaeb_x84`.
Gebruik `save_budget` met een nieuw `.ifcCalc`-pad om het resultaat als native
project te bewaren. `export_exchange_file` biedt BC3, ONLV, CUF, TRADXML en
RSX aan, maar geen GAEB-export.

## Grenzen van de koppelingen

De Nederlandse CUF/RAW, Spaanse BC3 en Oostenrijkse ONLV-formaten worden door
de app geïmporteerd en geëxporteerd. Een praktisch uitwisselproces vraagt nog
steeds om testbestanden van de ontvangende software; het eigen round-trip-testen
bewijst geen leverancierscertificering. SIA 451/CRBX, Italiaanse DCF/XPWE en
Amerikaanse OST/OSP zijn nog niet geïmplementeerd. Hun semantiek en eventuele
licenties moeten worden vastgesteld voordat er een betrouwbare converter kan
worden uitgebracht.

Bronnen: [GAEB versies en schema's](https://www.gaeb.de/de/service/downloads/gaeb-datenaustausch/),
[BVBS proefbestanden en certificering](https://www.bvbs.de/en/zertifizierungen/),
[FIEBDC/BC3](https://www.fiebdc.es/format-fiebdc/),
[ÖNORM A 2063](https://www.abk.at/support),
[SIA 451/CRBX](https://www.crb.ch/de/aktuelles/einheitlicher-datenaustausch-damit-wir-uns-besser-verstehen).
