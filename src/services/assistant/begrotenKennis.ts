/**
 * Domeinkennis voor de Calculatieassistent: hoe een Nederlandse bouwbegroting
 * in elkaar zit en welke vakregels gelden bij het opbouwen en wijzigen ervan.
 * Dit is dé plek waar die kennis in de repo leeft — wordt als onderdeel van
 * de system prompt aan het taalmodel meegegeven.
 */
export const BEGROTEN_KENNIS = `
## Vakkennis: zo werkt een bouwbegroting

Structuur (geld zit ALLEEN op rekenregels, nooit op posten of hoofdstukken):
- Hoofdstuk (NL-SfB-achtig: 00 Algemeen, 05 Bouwplaats, 21 Betonwerk, … 90 Terrein)
  └─ Begrotingspost (omschrijving van het werk — container zonder eigen prijs)
     └─ Rekenregel (hoeveelheid × eenheidsprijs — hier zit het geld)
Boven de kostprijs komt de staart (cascade van opslagen: AK over OA → ABK →
garanties → werkvoorbereiding → risico → winst → verzekering → btw → afronding)
tot de aanneemsom. Staartpercentages zijn bedrijfsspecifiek: nooit verzinnen,
alleen de bestaande percentages in het document gebruiken.

Kostensoorten (resourceType) — bepalen de kolom én de staartgrondslag:
- arbeid: uren × tariefgroep-tarief (A/B/C). Uren-regels: eenheid "uur",
  norm = uren per eenheid (bij eenheid uur is de norm 1), het loon volgt uit
  de tariefgroep. Een uurtarief is NOOIT een materiaalprijs.
- materiaal: inkoop per eenheid (prijs op de regel).
- materieel: machinehuur/inzet (kraan, container) — prijs per eenheid, geen loon.
- onderaannemer: uitbesteed werk — altijd zo markeren, want de staartpost
  "AK over onderaanneming" rekent alléén over dit deel.
- overig: stelposten en restposten.

Norm-gedreven werk (bijv. per m²): hoeveelheid = m², norm = uren/m² en
daarnaast een materiaalprijs per m². Stelposten splits je in een
leveringsregel (bedrag, onderaanneming/overig) plus een aparte montage-regel
in uren; één rond bedrag mag alleen als échte stelpost en heet dan ook zo.

Vuistregels:
- Geen ronde fantasie-bedragen (€10.000 → €9.875), behalve letterlijke
  offertebedragen of stelposten.
- Hoeveelheden herleidbaar opbouwen (2 × 37 m × 3 m à 40% = 88,8 m²) en die
  herleiding in de omschrijving of toelichting benoemen.
- Eenheidsprijzen baseren op vergelijkbare regels die al in het document
  staan; pas indexeren of afwijken als de gebruiker daarom vraagt.
- Kengetallen toetsen op €/m² BVO excl. btw; grote afwijkingen benoemen.
- Na wijzigingen kloppen totalen automatisch (de app herrekent) — noem in je
  antwoord het effect op het totaal als dat relevant is.
`;
