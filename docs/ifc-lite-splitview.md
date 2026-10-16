# 3D & Begroting met IFC-Lite

Open een begroting en kies onderaan **3D & Begroting**. Links staat het IFC-model; rechts kun je de begroting gewoon bewerken. Met de schuif **Verdeling** pas je de verhouding aan.

1. Kies **IFC openen** of sleep een IFC-bestand in het linkerdeel (maximaal 100 MB). IFC-Lite leest geometrie en quantitysets lokaal. De WebGL-weergave ondersteunt draaien, verschuiven en zoomen.
2. Klik in het model op een element. Gebruik Ctrl/⌘-klik voor meerdere elementen. Je kunt ook zoeken op naam of IFC-type en elementen aanvinken in de lijst. De lijst toont maximaal 300 zoekresultaten; versmal de zoekterm bij grotere modellen.
3. Kies de gewenste quantityset en hoeveelheid. Alleen hoeveelheden die op alle geselecteerde elementen voorkomen zijn gezamenlijk kiesbaar. **Aantal elementen** telt unieke elementen. Bruto en netto blijven afzonderlijke keuzes.
4. Selecteer rechts een begrotingspost of rekenregel en kies **Overnemen in geselecteerde post**. De eenheid en hoeveelheid worden overgenomen en de begroting wordt herberekend. Je kunt dit ongedaan maken.
5. Sla de begroting op. De modelidentificatie, element-ID's, quantitysets en hoeveelhedenkoppelingen staan in het native bestand. De volledige 3D-geometrie blijft sessiegebonden: open het oorspronkelijke IFC-bestand opnieuw om de 3D-weergave na herstart terug te krijgen. De laatst overgenomen hoeveelheden blijven behouden.

Lengte, oppervlakte en volume worden volgens de IFC-eenheden naar m, m² en m³ omgerekend. De importer gebruikt benoemde quantitysets; hij leidt ontbrekende hoeveelheden niet automatisch af uit geometrie. Controleer bij overname de gekozen netto/bruto-maat en de modelrevisie. Een gewijzigde IFC heeft een andere inhoudshash en vervangt een eerdere koppeling niet stilzwijgend.

Dezelfde selectie, isolatie en hoeveelhedenovername zijn bereikbaar via de [MCP-server](mcp-desktop.md).
