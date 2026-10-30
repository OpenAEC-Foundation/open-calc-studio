# Issueverwerking en acceptatie — 2026.44.0

Stand: 26 oktober 2026. Dit overzicht betreft deze ontwikkeltak, niet een reeds
gepubliceerde release. De lokale uitgangstak was schoon op `e5bff21`.

| Issue | In deze wijziging | Nog nodig voor volledige acceptatie |
| --- | --- | --- |
| [#28](https://github.com/OpenAEC-Foundation/open-calc-studio/issues/28) Hostcontract | Optionele en later geïnjecteerde `openaecHost`, initialFileId, open/save/list/versions, foutafhandeling en opaque-frameondersteuning | Werkelijke SuperCloud/Frappe-brug, browser- en printtest in de exacte sandbox, gehost releaseartifact publiceren |
| [#27](https://github.com/OpenAEC-Foundation/open-calc-studio/issues/27) Versies | Alle productpakketten 2026.44.0; ISO-weekscript, MSI 26.44.0, version-PR en tagcontrole | Volgende releasetag via deze workflow uitvoeren |
| [#26](https://github.com/OpenAEC-Foundation/open-calc-studio/issues/26) Ecosysteem | Capabilitymatrix, pure rekenservice, extern geteste HTTP/stdio-MCP, native buildmatrix, geteste container-CI, Blueprint-bronpin, release- en AWS-definities | Schone Windows/macOS/Linux-installaties, complete releaseondertekening, Claude Desktop/Code acceptatie en AWS-runtimebewijs |
| [#25](https://github.com/OpenAEC-Foundation/open-calc-studio/issues/25) Mobiel | Bestaande mobiele editor behouden; wizard toegevoegd en gedeelde bestands-/rekenkern gebruikt | Android Chrome en iPhone Safari via HTTPS; bestanden, terugkeer, concept en touch handmatig verifiëren |
| [#24](https://github.com/OpenAEC-Foundation/open-calc-studio/issues/24) Licentie | LICENSE/COPYING/NOTICE, LGPL-3.0-only in eigen manifests, Blueprint/fontnotices en gebundelde npm-notices | Distributiecontrole van de echte release blijft onderdeel van publicatie |
| [#23](https://github.com/OpenAEC-Foundation/open-calc-studio/issues/23) F12/contextmenu | Blokkade uitsluitend in productie binnen Tauri | Browserbediening visueel controleren |
| [#22](https://github.com/OpenAEC-Foundation/open-calc-studio/issues/22) Opslagsleutels | `ocs-`/`ocs:` voor taal, extensies en vensterbrug; opslagfallback bij geweigerde browserstorage | Hostcontrole op gedeelde origin; oude generieke taalsleutel wordt niet meer gebruikt |
| [#21](https://github.com/OpenAEC-Foundation/open-calc-studio/issues/21) Extensies/AI | Platform schakelt gebruikerscode, installatie/catalogus en persoonlijke AI-key uit; host/opaque runtimeguards | Netwerk-/CSP-controle in de uiteindelijke werkplek |
| [#20](https://github.com/OpenAEC-Foundation/open-calc-studio/issues/20) Accounts | Eigen login/cloud/AI-account in platform uit, accountinitialisatie afgeschermd | Eindtest in de gehoste werkplek |
| [#19](https://github.com/OpenAEC-Foundation/open-calc-studio/issues/19) Siteopslag | Hostadapter, recente bestanden, historische versies, optimistic concurrency, readOnly/Save as en behoud van edits tijdens saves | Host implementeren en end-to-end verbinden |
| [#18](https://github.com/OpenAEC-Foundation/open-calc-studio/issues/18) Externe bronnen | Lokale Blueprint/fonts/WASM, gebundelde voorbeelden/releasenotes, platformnetwerkfuncties uit, HTML-print zonder popup | Offline-/netwerkregistratie in echte browser, inclusief import en print |
| [#17](https://github.com/OpenAEC-Foundation/open-calc-studio/issues/17) Basispad | Vite base/manifest, gebundelde icoon- en font-URLs; build onder Frappe-basispad geverifieerd | Serveer/deploy de volledige map met juiste statische headers |
| [#16](https://github.com/OpenAEC-Foundation/open-calc-studio/issues/16) Frappe | Platformprofiel en gedocumenteerd, platformonafhankelijk hostcontract | Frappe-code, adapter en echte werkplektest liggen buiten deze repo |
| [#15](https://github.com/OpenAEC-Foundation/open-calc-studio/issues/15) DynLex | Scope-inventarisatie, uitvoerbare huidige baseline, prototypecontract, meet-/migratieplan | DynLex-prototype, grote UI-metingen en onderbouwd go/no-go; geen herschrijving afgerond |
| [#14](https://github.com/OpenAEC-Foundation/open-calc-studio/issues/14) Wizard | Vijf stappen, dezelfde store/calculator, foutinvoer, terugkeer, mobiel en embed mode | Visuele/toegankelijkheidsacceptatie met echte gebruikers en apparaten |
| [#12](https://github.com/OpenAEC-Foundation/open-calc-studio/issues/12) Handleiding | README, NL/EN-handleiding, wizard-, host-, Blueprint- en API-documentatie; wiki-bron bijgewerkt | De afzonderlijke GitHub-wiki publiceren/controleren |
| [#2](https://github.com/OpenAEC-Foundation/open-calc-studio/issues/2) macOS | Developer ID, Apple-notarisatie en gestapeld ticket geverifieerd; volledige DMG-controle controleert ook beide PDF-hulpprogramma's | Volledige DMG-run moet groen zijn; daarna starten en functies testen op een schone Mac |

## Aanvulling — 30 oktober 2026, 2026.44.5

- #24 is via PR #33 samengevoegd; GitHub herkent LGPL-3.0. Volledige teksten
  worden in het SDK-pakket en de native resources meegenomen.
- #31: taal/thema, Nederlandse hostaliassen, voorkeurwijzigingen en het
  weglaten van eigen titelbalk zijn geïmplementeerd. Gerichte tests slagen;
  daadwerkelijke Frappe/sandboxacceptatie blijft nodig.
- #35: grafische container uit dezelfde release-DEB, niet-root runtime,
  noVNC op 3000, app-afhankelijke gezondheid, interne HTTP-MCP en een
  Docker-smoketest zijn uitgevoerd. De [grafische containerproef](https://github.com/OpenAEC-Foundation/open-calc-studio/actions/runs/41041765193)
  slaagt zonder netwerk: native app, stream, MCP en crashdetectie werken.
  Idle-gebruik van de volledige container: 255,7 MiB op de GitHub Linux-runner.
  Release-CI blokkeert bij een mislukte containerproef; de eerste publieke
  imagepublicatie ontbreekt nog. De in
  het issue genoemde Blueprint-template/branch was op dit controlemoment
  niet beschikbaar; deze Calc-runtime is nog niet met die template vergeleken.
- #32: updater-signing uit PR #34 is geïntegreerd en de collector neemt ook
  macOS-updaterarchief en handtekening mee. De werkelijk gepubliceerde
  platformdownloads zijn hiermee nog niet vervangen of geverifieerd.
- #15: een native DynLex 0.0.1 mini-prototype rekent vijf varianten met
  hoeveelheden, uurloon, materiaal, opslag en btw door tegen de bestaande kern.
  Het is geen volledige migratie; zie de aanvullende haalbaarheidsrapportage.
- #26: Fargate-definitie en headless service blijven aanwezig. Er is nog
  geen gekozen/toegankelijke AWS-testomgeving voor een echte runtimeproef.
- De SuperCloud-brug in de lokale hostrepository gebruikt nog de eigen
  tijdelijke `werkplekCalc`-koppeling. De definitieve `openaecHost`-koppeling
  en praktijktests worden niet als afgerond aangemerkt op basis van Calc-tests.
- De afzonderlijke GitHub-wikirepository kon niet worden opgehaald; de
  gebruikershandleidingen in `docs/` bestaan wel. Publicatie van de wiki is
  niet als geslaagd aangemerkt.

## Platformacceptatie — 30 oktober 2026

De aanvullende `npm run test:platform`-suite laadt daadwerkelijk `.env.platform`
en controleert zes gevallen met echte React-componenten en applicatiestore:
geen eigen login/feedback/cloud-/extensieroutes, geen netwerkgebruik van een
oude persoonlijke AI-sleutel, geen laden van gebruikerscode uit IndexedDB en
geen botsingen met generieke taal-/extensievoorkeuren van andere tools.
Deze tests verifiëren de concrete code/UI-criteria van #20, #21 en #22.
Ze claimen geen live CSP-/netwerkacceptatie van de volledige SuperCloud.

De eerste ondertekende 2026.44.5-macOS-proef vond een ontbrekende
`plugins.updater.pubkey` bij ingeschakelde updater-artifacts. De bestaande
publieke repositoriesleutel is toegevoegd. Een verplichte controle vóór de
build en vier regressietests voorkomen herhaling. Ondertekende bundels worden
pas geaccepteerd nadat de herhaalde platformrun werkelijk slaagt.

## Uitgevoerde controles

- TypeScript `npx tsc --noEmit`: geslaagd.
- Volledige Vitest-suite: **629 geslaagd**, 6 overgeslagen, 82 testbestanden
  geslaagd en 1 overgeslagen. Een skip is geen acceptatiebewijs.
- De host-/storagecontroles omvatten ook de inline opstartcode, zodat geweigerde
  sessionStorage geen foutlus veroorzaakt na het mounten of een oneindige
  herstelpoging start. Een voorkeur die na een tijdelijke opslagfout alsnog
  naar browserstorage wordt geschreven, vervangt ook de oude geheugenwaarde.
- Node-API-integratie: **9 geslaagd**, inclusief officiële externe MCP SDK-client,
  inline-projectpariteit, authenticatie, schema, 413/503/504 en geweigerde origin.
- Externe stdio-MCP: gelijke rekenuitkomsten voor standaard/tarief/gemengde btw
  en RSX; uitwisseling BC3/ÖNORM/CUF/GAEB geslaagd.
- Reguliere webbuild, embed/framebuild en platformbuild onder
  `/assets/open_aec/open-calc-studio/`: geslaagd. Manifest en aanwezige
  bronnotices gecontroleerd. IFC-Lite geeft nog een waarschuwing over chunkgrootte.
- Blueprint: 31 ongewijzigde bronbestanden gecontroleerd met SHA-256. Bronpin
  `83916c9633e1893f332904e2337f77833f0f757a`, ontwerp 0.4.0; webmap identiek
  aan de eerder beoordeelde commit `05d6873`.
- ISO-week-/versietests en manifestcontrole; workflow-YAML en Linux-signingshell
  syntactisch gecontroleerd. GitHub-uitvoering is afzonderlijk bewijs.
- Fargate CloudFormation: `cfn-lint` geslaagd; geen echte AWS-deploy uitgevoerd.
- GitHub-containercontrole geslaagd: non-root, read-only bestandssysteem,
  healthcheck, geweigerd verzoek zonder sleutel en echte inline-calculatie.

- Linux x64 native app én `.so` gebouwd, Rust ABI-metadata-/thread-local-test
  geslaagd en de nieuwe bibliotheek geladen vanuit de C-host:
  `Open Calc Studio 2026.44.0; ABI 1`. Dit controleert het laden en de ABI,
  niet het visueel functioneren van het venster. Het lokale pakket is unsigned.
- De vijf aangepaste GitHub-workflows zijn gecontroleerd met `actionlint`.
- De eerste schone CI-installatie vond een IFC-workertransformatiefout bij
  het oude Safari 13-bouwdoel. App, platform en embed gebruiken nu dezelfde
  ES2020-taaldoelstelling; de gebruikte bundler wordt expliciet vastgelegd.
  Browserfeatures blijven afzonderlijke runtimevereisten en moeten op de
  bedoelde apparaten worden gecontroleerd.
- De Windows-nativecheck vond loaderfout 127 op de schone runner. MSVC-pakketten
  nemen nu de bijbehorende app-local C++-redistributables mee; de workflow
  registreert bij een laadfout ook de imports en behoudt het diagnosepakket.
- De importdiagnose identificeerde `TaskDialogIndirect`: het externe C-hostprogramma
  moet Common Controls 6 activeren voordat de product-DLL laadt. Het voorbeeld
  embedt deze afhankelijkheid nu; een los manifest voor eigen C/C#-hosts gaat mee.
- GitHub heeft de native bibliotheek op Windows, Linux en macOS gebouwd en
  vanuit een C-host geladen. De Windows-installer-/ondertekeningsrun is ook
  geslaagd (run 40351838266, Windows-job); installers, DLL en host zijn gecontroleerd.
- De universele macOS-app miste de meegebouwde PDF-hulpprogramma's in de
  gecombineerde uitvoermap. Een bundelhaak combineert nu beide architecturen
  voor deze binaries; vier lokale bundelhaaktests slagen. Beide Cargo-targets
  staan expliciet in het manifest, zodat Tauri niet één automatisch ontdekt
  hulpprogramma overslaat.
- [Run 40365958317](https://github.com/OpenAEC-Foundation/open-calc-studio/actions/runs/40365958317)
  kreeg Apple-status `Accepted`; strict codesign, Gatekeeper (`Notarized Developer ID`)
  en ticketvalidatie slaagden op de app uit het DMG. De complete pakketcontrole
  vond vervolgens de ontbrekende `gen_pdf` en weigerde het artifact.
  De [herhaalde DMG-controle](https://github.com/OpenAEC-Foundation/open-calc-studio/actions/runs/40370648122)
  controleert na de manifestfix alle drie de executables. Alleen een volledig
  groene run telt als bewijs voor het complete installatiepakket.

Docker en AWS CLI zijn hier niet beschikbaar. De lokale browserautomatisering
werd door de automatische goedkeuringscontrole geweigerd; er is geen visuele
UI-test of telefoon-/opaque-frame-eindtest als geslaagd aangemerkt.

## Concrete eindacceptatie

Open in vijf thema's een gewone begroting en wissel grid/wizard. Bewerk en
bewaar hoeveelheden, prijs, toeslagen, offerte en deelblad; heropen en vergelijk
alle bedragen en metadata. Herhaal op een telefoon. Laat de echte host een
versieconflict en readOnly-versie leveren en test een laat geïnjecteerde host
in een frame zonder allow-same-origin. Registreer netwerkverkeer bij starten,
import en print. Test installers en native hosts op schone OS-images. Bewaar
artifactversie, commit, checksums, signer en testresultaten voordat de
overkoepelende issues gesloten worden.

De handmatige Linux-installerbuild uit run 40351838266 is geslaagd. Het artifact
registreert expliciet `signed: false`: de OpenAEC OpenPGP-sleutel ontbreekt.
GitHub-provenance is aangemaakt. De signingcode is met een wegwerptestkey
functioneel gecontroleerd: installer-/checksumhandtekeningen, verkeerde
fingerprint, ontbrekende tagconfiguratie en de expliciete unsigned devmodus.
Deze testkey is niet voor projectreleases gebruikt en is verwijderd.
