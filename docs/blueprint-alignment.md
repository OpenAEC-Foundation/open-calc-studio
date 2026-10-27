# OpenAEC Blueprint in Open Calc Studio

De UI gebruikt de officiële webtokens, componentklassen en lokaal meegeleverde
fonts van [OpenAEC-Blueprint](https://github.com/OpenAEC-Foundation/OpenAEC-Blueprint/tree/83916c9633e1893f332904e2337f77833f0f757a/web).
De bronrepo heette eerder OpenAEC-Style-Repo. Vastgezette commit:
`83916c9633e1893f332904e2337f77833f0f757a`, ontwerpversie **0.4.0**.

`src/styles/blueprint/` bevat ongewijzigde bronbestanden. `SOURCE.json` legt de
SHA-256-hash per bestand vast. Controleer met `npm run check:blueprint`.
Updaten betekent de upstreamwijziging beoordelen, bestanden en hashes samen
vervangen en de vijf thema's opnieuw controleren. Een zwevende `main`-import
of externe fontservice is niet nodig.

`blueprintBridge.css` verbindt de bestaande calculatiecomponenten met de
`--oa-*` kleur-, typografie- en focusrollen. Startknoppen, de wizard en de
hostbestandskiezer gebruiken ook de officiële `oa-*` componentklassen.
Instellingen bieden light, dark, blueprint, high-contrast-dark en
high-contrast-light. Oud opgeslagen themanamen worden omgezet. Het
spreadsheetraster, de ribbon en de IFC/PDF-werkruimten blijven productspecifieke
componenten; dit is geen volledige vervanging van alle widgets.

De desktopwerkruimte heeft vaste navigatie voor begroten, assistent, wizard,
rapporten, PDF, 3D en rekenbladen. Een projectkop toont de projectnaam,
opslagstatus en het live totaal exclusief btw. Projecten en bestanden openen
in een uitschuifpaneel; de onderbalk bevat de begroting en de echte rekenbladen.

Inter levert interfacetekst, Inter AEC de cijfers, Space Grotesk Medium (500)
de koppen en JetBrains Mono technische labels. De volledige desktopwerkruimte
gebruikt `oa-app`; invoervelden en knoppen erven daardoor de juiste fonts.
Er is één fontregistratie uit Blueprint, zonder de oude concurrerende
`/fonts/*.ttf`-definities. Fonts en WASM blijven lokale buildassets. Het npm-pakket
scopeert de selectors onder `.ocs-embed`, inclusief `data-oa-theme` op de
wrapper. Afzonderlijke iframe-instanties behouden hun eigen store en thema.

De Blueprint CSS heeft **CC-BY-SA-4.0**; fonts hebben **OFL-1.1**. De
bronlicentie en fontnotices gaan mee in de distributies. De appcode en de eigen
adapter hebben **LGPL-3.0-only**. De B2-iconenset is niet overgenomen: de
licentie daarvoor is nog niet vastgesteld. Bestaande producticonen blijven
in gebruik. Zie [NOTICE](../NOTICE.md).

De README volgt de installatie-, functies-, versies-, ontwikkel- en
licentie-indeling van de Blueprint-template. Het versiescript gebruikt
`jaar.ISOweek.patch`; CI verifieert de onderlinge versies en tag. De
releasepipeline vereist platformondertekening en publiceert checksums en
provenance. De [acceptatiestatus](issue-readiness.md) maakt onderscheid tussen
bronimplementatie, lokale tests en daadwerkelijk geleverde releases.
