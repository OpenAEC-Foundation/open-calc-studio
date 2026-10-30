# Calculatiewizard

Kies **Calculatiewizard** op het startscherm of in de onderbalk. Op een telefoon
staat de wizard in de onderste navigatie. De vijf stappen bewerken hetzelfde
document als het raster:

1. **Project:** naam, nummer, opdrachtgever en omschrijving.
2. **Hoeveelheden:** hoofdstukken en posten toevoegen, omschrijving, aantal en
   eenheid aanpassen. Filter per hoofdstuk om de kostenopbouw overzichtelijk
   te houden.
3. **Kosten:** directe prijzen, loon en normen van de onderste kostenregels
   aanpassen. Ouders met onderliggende kosten worden door de bestaande motor
   berekend; vul ze niet nogmaals als losse kosten in.
4. **Toeslagen:** bestaande staartpercentages controleren. Voor bijzondere
   grondslagen, tariefgroepen en btwverdeling gebruik je de volledige editor.
5. **Controle:** totalen en waarschuwingen bekijken en opslaan.

Ongeldige getalinvoer wordt gemarkeerd en blokkeert stapnavigatie. In het
Nederlands kun je bijvoorbeeld `1.234,50` invullen. **Volledige editor** opent
het raster met dezelfde wijzigingen, zonder export/import. De wizard maakt
geen aparte kopie of alternatieve rekenmotor. Opslaan gebruikt dezelfde
browser-, desktop- of hostopslag als de rest van de app.

In een ingebouwde app kun je starten met `<OpenCalcStudio mode="wizard" />`
of `mountIsolated(element, { src, mode: 'wizard' })`. De wizard is optioneel;
het raster blijft de standaard. Zie het [embedcontract](library-integration.md)
en [hostopslag](supercloud.md).
