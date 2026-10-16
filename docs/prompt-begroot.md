# Prompt & Begroot

Open een begroting en kies onderaan **Prompt & Begroot**. Links staat de
calculatieassistent, rechts de gewone bewerkbare begroting. De assistent krijgt
de actuele posten, aantallen, tarieven en totalen mee als context.

Een opdracht die de begroting wijzigt verschijnt eerst als voorstel. Controleer
de acties en kies **Toepassen in begroting** of **Verwerpen**. Zodra de begroting
na het voorstel is veranderd, wordt het voorstel ongeldig en kun je de opdracht
opnieuw stellen. Toepassen legt één stap vast voor **Ongedaan maken**. Als een
actie uit de batch niet kan worden uitgevoerd, wordt de hele batch teruggedraaid.

Zonder AI-account werkt één gerichte lokale opdracht, bijvoorbeeld:

> Voeg onder 21.01 een regel toe: 12,5 m³ Beton C30 à €145,50

Gebruik het bestaande nummer van een begrotingspost. `m2` en `m3` worden als
`m²` en `m³` opgeslagen. Uurregels volgen het aparte tariefgroepmodel en vallen
buiten deze korte opdracht. Voor vrije vragen en complexere opdrachten is een
OpenAEC-aanmelding of een ingestelde Anthropic API-sleutel nodig. Zonder die
verbinding blijven lokale vragen over totalen en hoofdstukken beschikbaar.

Sla de begroting na toepassing op. De regels worden met het document opgeslagen;
het chatgesprek zelf is sessiegebonden.
