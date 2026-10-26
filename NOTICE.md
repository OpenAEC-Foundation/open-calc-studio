# Licenties en bronvermelding

Open Calc Studio is een project van de OpenAEC Foundation. De eigen broncode,
het npm-inbouwpakket, de MCP-server en de native bibliotheek vallen onder
LGPL-3.0-only; zie `LICENSE` en de bijbehorende GPL-tekst in `COPYING`.

De ongewijzigde web-CSS en lettertypen onder `src/styles/blueprint/` komen uit
[OpenAEC Blueprint](https://github.com/OpenAEC-Foundation/OpenAEC-Blueprint),
commit `05d6873ee02461cdc783d2d93dd447726ec0eefe`, ontwerp 0.4.0. De bron-CSS
valt onder CC-BY-SA-4.0 (`src/styles/blueprint/LICENSE`). De eigen adapter
`src/styles/blueprintBridge.css` vertaalt bestaande Calc-selectoren naar de
gedeelde tokens; de upstreambestanden zijn niet gewijzigd.

Inter en Inter AEC, Space Grotesk, JetBrains Mono, Noto Sans en Noto Sans Symbols
hebben hun eigen OFL-1.1-licenties in `src/styles/blueprint/fonts/*-OFL.txt`.
De bronbestanden en hun SHA-256 staan in `src/styles/blueprint/SOURCE.json`.
De B2-iconen zijn niet overgenomen: hun upstreamlicentie is nog niet vastgesteld.

JavaScript-, Rust- en systeembibliotheken behouden hun eigen licenties. De
headless serverbuild schrijft een `THIRD-PARTY-NOTICES.txt` met de daadwerkelijk
gebundelde npm-pakketten en hun aanwezige licentieteksten naast de server.
De web-, inbouw- en native distributies nemen deze product- en Blueprintnotices mee.
