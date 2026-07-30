---
name: begroten
description: Use when maken, aanpassen, controleren of bespreken van een bouwbegroting / calculatie / kostenraming (Nederlandse bouw) — hoofdstukken, begrotingsposten, rekenregels, normuren, tarieven, staartkosten, stelposten, aanneemsom, kengetallen (€/m² BVO, €/woning), btw.
---

# Begroten (Nederlandse bouw)

## Overview
Een begroting bouwt de kostprijs op uit **hoeveelheid × eenheidsprijs** per rekenregel, opgeteld via posten en hoofdstukken; daarboven komt de **staart** (opslagen) tot de aanneemsom. Geld zit ALLEEN op rekenregels — nooit op posten of hoofdstukken.

## Structuur
```
Hoofdstuk (NL-SfB-achtig: 00 Algemeen, 05 Bouwplaats, 21 Betonwerk, … 90 Terrein)
└─ Begrotingspost (omschrijving van het werk — container, GEEN eigen prijs)
   └─ Bewakingspost (optioneel; groepeert regels voor werkbewaking/nacalculatie — ook zonder eigen prijs)
      └─ Rekenregel (hoeveelheid, eenheid, prijs, norm — hier zit het geld)
```
Sorteer hoofdstukken op nummer. Elke post minimaal één regel. Alleen rekenregels dragen geld; elk containerniveau telt zijn kinderen op.

## Kostensoorten (bepalen kolom én staart)
| Soort | Wat | Voorbeeld |
|---|---|---|
| Loon | uren × tariefgroep-tarief (A/B/C) | montage, afmeren, vergaderen |
| Materiaal | inkoop per eenheid | staal €2/kg, spouwankers |
| Materieel | huur/inzet machines | kraan €162/u, container, werfdag |
| Onderaanneming | uitbesteed werk | metselwerk, heiwerk, prefab |
| Stelpost/overig | nog te bepalen budget | tuin, sanitair |

Onderaanneming apart markeren: de staartpost "AK over onderaanneming" rekent alléén over dit deel.

## Loon-regels (de meest gemaakte fout)
- **uren = hoeveelheid × norm** (norm = uren per eenheid; bij eenheid 'uur' is norm 1)
- **bedrag = uren × tarief** van de tariefgroep (bijv. A €66, B €46, C €82)
- Het uurtarief is NOOIT een materiaalprijs. Staat loongeld in de materiaalkolom → fout gemodelleerd.
- Norm-gedreven werk (per m²): hoeveelheid=m², norm=uren/m², plus aparte materiaalprijs/m².

## Stelposten
Splits in twee regels: **levering** (bedrag, meestal onderaanneming/overig) + **montage** (uren in loon). Eén bedrag mag alleen als echte stelpost, duidelijk zo benoemd.

## Staart (cascade, NL-gebruikelijk)
Bouwt vanaf de kostprijs cascade-gewijs op. Elke opslag rekent over een **eigen basis** — niet alles over hetzelfde bedrag:

| Opslag | Rekent over | OCS-default* |
|---|---|---|
| AK over onderaanneming | alléén de onderaanneming-kolom | 9% |
| Algemene bedrijfskosten (ABK) | loon + materiaal + materieel | 6% |
| Garanties | loon + materiaal + materieel | 2% |
| Werkvoorbereiding & PM | loon + materiaal + materieel | 2% |
| **= totaal kostprijs** | | |
| Risico | cumulatief (alles t/m hierboven) | 3% |
| Winst | cumulatief | 5% |
| Verzekering | cumulatief | 0,5% |
| **= aanneemsom excl. btw** | | |
| Btw hoog | aanneemsom excl. | 21% |
| Afronding | naar hele euro's | — |

*Percentages zijn bedrijfsspecifiek: neem ze over uit de bedrijfsstandaard; de kolom is de default als die ontbreekt — niet zelf verzinnen. Het is een cascade (risico/winst/verzekering rekenen over de al opgehoogde kostprijs), dus percentages zijn niet zomaar optelbaar. De rapport-samenvatting neemt deze percentages en bedragen 1-op-1 over uit de staart-regels.

## Kengetallen & toetsing
Vul BVO (m²) en aantal woningen als projectkengetallen; toets **€/m² excl. btw**. Vuistband nieuwbouw sociaal (prijspeil ±2024): bouwkosten ~€1.700–2.200/m² BVO excl. btw; bijzondere bouw (drijvend, hoogbouw) ligt hoger. Wijkt het sterk af → hoeveelheden en grote posten nalopen.

## Vuistregels
- Geen ronde bedragen (€10.000 → €9.875) — behalve letterlijke offertebedragen.
- Hoeveelheden herleidbaar noteren (2× 37×3 m à 40% = 88,8 m²), niet alleen het resultaat.
- Eenheidsprijzen uit de bedrijfsstandaard of referentieproject; pas indexeren als dat expliciet mag.
- Na elke wijziging: herrekenen én opslaan.

## Common mistakes
| Fout | Gevolg | Goed |
|---|---|---|
| Prijs op begrotingspost | dubbeltelling met regels | prijs alleen op regels |
| Uurtarief als materiaalprijs | loon in materiaalkolom, uren leeg | norm + tariefgroep |
| Norm gebruikt als vermenigvuldiger op stuksprijs | bedrag × uren te hoog | norm = uren/eenheid |
| Eén ronde stelpost voor meetbaar werk | niet toetsbaar | hoeveelheid × eenheidsprijs |
| OA niet gemarkeerd | AK-over-OA klopt niet | resourcesoort zetten |
| Elke opslag over dezelfde basis | AK-OA/ABK/risico verkeerd | elke opslag over z'n eigen basis (zie Staart) |
