# Nederlandse prijsbibliotheek — eerste basis

Open **Begroting → Prijsbibliotheek NL**. Er zijn 98 voorbeeldmiddelen voor bouw, met categorie, eenheid, middelsoort en bron. Selecteer een begrotingspost om een middel als calculatieregel toe te voegen; zonder selectie kun je de bibliotheek raadplegen.

De gegevens staan in `src/data/nl-price-library.json`:

- 98 bestaande bouwvoorbeeldmiddelen, onder meer arbeid, materieel, isolatie en afbouw.

Dit is geen actuele of volledig geprijsde landelijke kostendatabase. Peildatum en btw-basis zijn voor de bestaande referentieprijzen niet aangetoond. Daarom is `defaultUnitPrice` leeg. Een eventuele oude voorbeeldprijs staat apart als `referenceUnitPrice` en wordt zichtbaar als ongeverifieerde referentie, maar niet overgenomen in de begroting.

Na toevoegen vul je de gecontroleerde prijs in de calculatieregel in. De notitie vermeldt dat de prijs ontbreekt. Nul in een totaal is geen bewijs dat een ongeprijsde regel gratis is.

Voor het verrijken van de bibliotheek leg je per middel vast:

1. De nauwkeurige specificatie en prijseenheid.
2. Een offerte, leveranciersprijslijst of andere herbruikbare prijsbron.
3. De peildatum en eventuele geldigheidsduur.
4. Of de prijs exclusief btw is, en of levering, toeslagen of korting zijn inbegrepen.
5. Pas daarna een actieve `defaultUnitPrice` en `priceDate`.

Eenheden zoals `are`, `st/wk` en `%kg` uit de bron worden zichtbaar behouden maar zijn geblokkeerd voor toevoegen totdat de omrekening is vastgelegd. Ze worden niet stilzwijgend als stuks berekend.

De bibliotheek is in de app gebundeld en werkt ook zonder een afzonderlijk `/libraries/`-webpad. Een later geladen eigen bibliotheek wordt niet door een achtergrond-download overschreven. Prijsbeheer met offerte-import en prijsversies is een vervolgstap; deze eerste versie levert de geordende basis en de koppeling naar calculatieregels.
