# Wereldwijde begrotingsformaten en voorbeeldbestanden

Onderzocht op **9 oktober 2026** voor Open Calc Studio. Twaalf kandidaten/profielen, met bronnen in Europa, Azië, Afrika, Noord-Amerika, Zuid-Amerika en Oceanië. Dit is een gerichte verkenning, geen uitputtende inventarisatie van alle nationale standaarden.

**Advies: begin met XPWE en XC4 als nieuwe structurele importers. Voeg daarnaast herkenningsprofielen voor regionale Excel-begrotingen toe aan de bestaande tabulaire import.** Voor deze keuze tellen beschikbare echte testbestanden, documentatie en aansluiting op het bestaande datamodel zwaarder dan alleen marktbereik.

## Wat al aanwezig is

De huidige repository heeft onder meer CUF/RAW/RSX, IBIS/XTB, WPCalc/BasCalc, BC3/FIEBDC-3, ÖNORM A 2063, GAEB DA XML, IFC/IFCX en CSV/Excel. GAEB is dus inmiddels geen nieuw formaat meer. Zie `docs/wereldwijde-uitwisseling.md`, `src/services/importers/` en `src/services/importers/genericTabularImporter.ts`.

Een bestandsextensie is niet hetzelfde als een begrotingsstandaard. DPGF, NIC BOQ, SINAPI-tabellen, Zuid-Afrikaanse BOQ's en SM014 zijn afzonderlijke inhoudelijke profielen op Excel. Een PDF-uitdraai is evenmin gelijkwaardig aan een machineleesbaar origineel. NRM, SMM, CSI/MasterFormat en vergelijkbare classificaties moeten niet zonder meer als zelfstandig importformaat worden gepresenteerd.

## Kandidaten en bewijs

| Regio / formaat | Wat levert het op? | Voorbeeld en verificatie | Advies |
|---|---|---|---|
| **Italië — XPWE**, `.xpwe`, XML | Begrotingsposten, prijzenbestand, meetregels en categorieën; gebruikt in het PriMus-ecosysteem. [ACCA documenteert import/export](https://www.acca.it/come-fare-il-computo-metrico-con-primus). | [Palazzo Poggi, Bologna](https://intercenter.regione.emilia-romagna.it/bandi-e-strumenti-di-acquisto/bandi-altri-enti/altri-enti-bandi-e-procedure-di-gara/bandi-altri-enti-chiusi/BANDO_GARA_PORTALE@8809610), bijlage **CME in formati editabili.zip**, onder verduidelijking PI202174-24. Gedownload: XPWE + PWE + XLSX. XPWE geparseerd: **844 VCItem**, **488 EPItem**, **2.770 RGItem**. | **Eerste keuze.** Machineleesbare projectbegroting en een bijbehorende Excel-versie voor latere kruiscontrole. |
| **Tsjechië — XC4**, XML | Werkomschrijvingen, aanbiedingen en andere uitwisselfasen. [Open documentatie en validator](https://www.xc4.cz/). | [VD Kadaň — trámce, etappen 1 en 2](https://zakazky.eagri.cz/contract_display_21798.html). Twee XML-bestanden gedownload en geparseerd: **XC4 4.4, 88 en 578 `polozka`-elementen**. Dit zijn bestekken **zonder prijzen**. | **Eerste keuze.** Begin met werkposten/hoeveelheden; prijsaanbiedingen en uitvoeringsfasen apart behandelen. |
| **Polen — ATH / ATH2** | Uitwisseling in onder andere het Norma-ecosysteem. De [Norma-versiehistorie](https://ath.pl/Portals/0/pliki/historia-zmian/lista-zmian-NormaSTANDARD2.pdf) noemt ATH/ATH2. | [WIHE, aanbestedingen 2023](https://wihe.pl/przetargi/nauka-ponizej-30K-2023), bijlage **Załącznik nr 3 – Kosztorys budowlany nakładczy (ATH)**. ZIP gedownload; ATH uitgepakt, **7.540 bytes**, header `[KOSZTORYS ATHENASOFT]`, `wf=4`, producer NORMA. | **Tweede tranche.** Echt voorbeeld beschikbaar, maar een volledige openbare formatspecificatie is in deze ronde niet vastgesteld. ATH2 niet gelijkstellen aan het onderzochte ATH-bestand. |
| **Noorwegen — NS 3459 XML** | Leveranciersonafhankelijke uitwisseling van omschrijvingen, prijzen en afrekening. [Standard Norge](https://standard.no/en/sectors/digital-price-inquiry--ns-3459/digital-price-inquiry--ns-3459/) noemt **NS 3459:2023** als huidige editie. | [Nordlandsbanen 2025–27](https://www.mercell.com/fi-fi/hankinta/242580219/sville--og-skinnebytte-nordlandsbanen-2025-27-hankinta.aspx) vermeldt projectbijlagen `D1 OPSJON Sporfornyelse Nordlandsbanen 2026 NS3459-2023.xml` en de 2027-variant. **Bestandsnamen gevonden; inhoud niet gedownload/gevalideerd.** | Kansrijk, na verkrijgen van actuele specificatie en passende vraag/aanbieding-voorbeelden. Oudere 2009/2012-bestanden zijn geen bewijs van 2023-compatibiliteit. |
| **Zwitserland — SIA 451 / CRBX, IfA18** | NPK-bestekken en prijsaanbiedingen. [CRB beschrijft CRBX en de uitwisselrichtlijn](https://www.crb.ch/de/aktuelles/einheitlicher-datenaustausch-damit-wir-uns-besser-verstehen). | [GSA](https://www.gsa-technology.ch/gsa-technologie/gsa-grundlagen-2/) kondigt SIA 451-bestekteksten aan, maar op de huidige downloadpagina is geen directe bijlage geverifieerd. [DARTUS-downloads](https://www.geospro.ch/downloads/dartus-5/) bieden `SIATEST_NPK.crb`, maar dat is een **catalogusdatabase**, geen bewezen CRBX-projectbegroting. | **Nog niet testklaar.** Vraag een kleine echte `.crbx` met PDF-controleblad op en bepaal de toepasselijke IfA-/NPK-voorwaarden. SIA 451, CRBX en `.crb` niet verwisselen. |
| **Frankrijk — DPGF / BPU / DQE in Excel** | Regionale indeling voor prijsopbouw, eenheidsprijzen en hoeveelheden; meerdere layouts in plaats van één XML-schema. | [Castres-Gironde, gemeentelijke aanbestedingen](https://www.castres-gironde.fr/index.php?catid=8&id=23&option=com_content&view=article), **2024 — construction salle d'arts martiaux**, DPGF XLSX van 35,94 kB. Downloadlink gevonden; lokale download gaf HTTP 403. | Herkenningsprofiel bovenop Excel-import. DPGF, BPU en DQE afzonderlijk herkennen; documentsoort en kolommen bevestigen. |
| **India — NIC/GePNIC BOQ in XLS** | Gestandaardiseerde aanbestedingswerkboeken met onder meer item-rate, percentage en multicurrency-varianten. | [Government of India downloads](https://www.eprocure.gov.in/eprocure/app?page=StandardBiddingDocuments&service=page). **V3.1_BOQ_ItemRate_Template.xls gedownload**, 299.520 bytes, OLE/Excel-signatuur bevestigd. Dit is een **sjabloon**, geen ingevulde bouwbegroting. De pagina biedt ook andere versies. | Kansrijk Excel-profiel. Voor een echte acceptatietest is aanvullend een ingevuld bouwproject nodig. Macro's niet uitvoeren; geen foutloze teruglevering aan het tenderportaal beloven op basis van alleen een leesimport. |
| **Brazilië — SINAPI XLSX + projectplanilhas** | SINAPI levert referentieprijzen en kostensamenstellingen; dat is een prijs-/normenbron, geen universeel projectbestand. [CAIXA beschrijft de maandelijkse ZIP/XLSX-publicaties](https://www.caixa.gov.br/poder-publico/modernizacao-gestao/sinapi/Paginas/default.aspx). | De [São Valentim-overheidspagina](https://saovalentim.rs.gov.br/site/anexospub/search?categoria=52%2F&tipo=1) vermeldt voor Praça Tancredo Neves een `PLANILHA ORÇ.xls`, composities en `SINAPI 02-2026.xls`. **Bron gevonden, bestanden niet gedownload.** CAIXA gaf in deze sessie een redirectlus. | Twee adapters: catalogus/samenstellingen en projectbegroting. Regio, peildatum, broncode en desonerado/não-desonerado bewaren; BDI niet dubbel toepassen. |
| **Zuid-Afrika — project-BOQ XLS/XLSX** | Praktische aanbestedingsbegrotingen voor wegen, water en riolering. Geen enkel landelijk bestandsschema vastgesteld. | [Moses Kotane Municipality](https://www.moseskotane.gov.za/electronic-boqs/): **TLOKWENG ROAD PHASE 2 BOQ**, XLSX, gepubliceerd 7 april 2026. Gedownload: **435.627 bytes**, OOXML-container geopend. Inhoud en bedragen nog niet in OCS gevalideerd. De pagina bevat veel andere projectvoorbeelden. | **Snelle Excel-profielkandidaat.** Meerdere werkbladen, hoofdstukken, voorlopige posten en subtotalen herkennen zonder totalen dubbel te tellen. |
| **Nieuw-Zeeland — NZTA SM014-werkboeken** | Officiële projectramingen en elementaire kostenstructuren; aanvullend een kostenbenchmarkdatabase. | [NZTA SM014](https://www.nzta.govt.nz/resources/cost-estimation-manual) vermeldt **Appendix B1 Elemental breakdown of costs**, **B1.1 WBS**, **Appendix C Estimate summary** en **Elemental costing database**. Geïndexeerde leverancierspagina geverifieerd; directe toegang gaf 403. **Geen werkboek gedownload.** | Interessant profiel voor ramingen en benchmarks. Sjablonen, databank en ingevulde projectramingen apart houden. |
| **Verenigde Staten — FEMA CEF Excel** | Basisbouwkosten plus aanvullende kostencomponenten. [FEMA-training](https://emilms.fema.gov/is_1013/groups/313.html) beschrijft de CEF-spreadsheet en Part A. | [FEMA CEF-toolpagina](https://www.fema.gov/assistance/public/cost-estimating-tool). Het officiële XLSX-sjabloon is in de training genoemd; de toolpagina gaf 403. **Geen ingevuld project of XLSX lokaal geverifieerd.** | Later als expliciet versiegebonden profiel. CEF-factoren zijn geen generieke Nederlandse staart; geen aanspraak op FEMA-conformiteit zonder aparte verificatie. |
| **Rusland — GGE XML** | Gestructureerde lokale, object- en verzamelramingen, met verschillende rekenmethoden/schema's. [GRAND-Smeta publiceert schemastructuren](https://xsd.grandsmeta.ru/). | De gevonden download voor `ls_rim_301.zip` gaf **404**. Documentatie is zichtbaar, maar **geen voorbeeldbegroting gedownload**. De schema's verschillen per type/versie. | Verkennend. Eerst geldige schema's plus concrete projectbestanden; niet één algemene `.gge`-parser beloven. |

## Lokaal verzameld materiaal

Map: `/home/aia06/Documenten/ChatGPT/Inteco/global-estimate-formats-2026-10-09/`.

| Bestand | Type / controle |
|---|---|
| `it-palazzo-poggi.zip` | Originele overheidsbijlage met XPWE, PWE en XLSX. |
| `it-palazzo-poggi.xpwe` | Uitgepakt XML; structuur en aantallen geverifieerd. |
| `cz-kadan-stage1.xml` | XC4 4.4, 88 posten, zonder prijzen. |
| `cz-kadan-stage2.xml` | XC4 4.4, 578 posten, zonder prijzen. |
| `pl-wihe-ath.zip` | Originele aanbestedingsbijlage. |
| `pl-wihe.ath` | Uitgepakt ATH; header gecontroleerd. |
| `za-tlokweng-road.xlsx` | OOXML-projectwerkboek; container gecontroleerd. |
| `in-nic-itemrate-template.xls` | Officieel leeg NIC-sjabloon; Excel-signatuur gecontroleerd. |
| `downloads.json` | Herkomst, downloadstatus, bytes en SHA-256 van de downloads; mislukte GGE-download apart vastgelegd. |
| `xml-inspection.json` | Getelde XML-elementen voor XPWE en XC4. |

**Zes originele downloads en twee uitgepakte bestanden.** De bestanden zijn niet in Open Calc Studio geïmporteerd: downloadbaarheid en parseerbare XML bewijzen nog geen juiste bedragen, formule-uitkomsten of volledige importondersteuning. De aantallen hierboven zijn tellingen van benoemde bron-elementen.

De openbare bronnen verlenen niet automatisch een licentie om hun begrotingsinhoud met onze software te verspreiden. De ruwe downloads blijven daarom lokaal buiten de Git-repository. Voor publieke CI-fixtures: hergebruikvoorwaarden vaststellen of eigen kleine voorbeelden maken, met vergelijkbare structuur en eigen teksten/bedragen. Documenteer daarbij het verschil tussen eigen fixtures en originele praktijkbegrotingen.

## Voorgestelde implementatievolgorde

1. **XPWE-lezer**: `PweDocumento` herkennen; `EPItem` koppelen aan `VCItem` via `IDEP`; categorieën, meetregels, eenheden en tarieven behouden. Niet PWE/DCF behandelen alsof die dezelfde XML zijn. Het prijsveld en de meetformules eerst tegen de meegeleverde Excel-versie controleren. Brontekst/IDs en waarschuwingen over niet-ondersteunde velden bewaren.
2. **XC4 4.4-lezer**: begin met de twee prijsloze bestekken. Koppel objecten, hoofdstukken en posten; behoud broneenheden en hoeveelheidsprecisie. Geen ontbrekende prijs als een expliciet gratis aanbod behandelen. Voor uitwisseling van aanbiedingen eerst een bijbehorend ingevuld voorbeeld toevoegen.
3. **Excel-profielen**: start Zuid-Afrikaanse project-BOQ en India NIC; voeg Frankrijk en Brazilië toe zodra de voorbeelden lokaal gecontroleerd zijn. Bouw voort op de bestaande tabulaire importer met profielherkenning en een controlepreview, in plaats van een aparte Excel-engine per land.
4. **ATH**, daarna **NS 3459**: ATH heeft nu een echt testbestand; de semantiek/versies vragen nog onderzoek. NS 3459 heeft een duidelijke standaardeigenaar, maar mist lokaal geverifieerde actuele fixtures.
5. **CRBX, SM014, CEF en GGE**: voorlopig onderzoek/backlog. Voor CRBX ontbreekt een projectfixture; de laatste drie vragen respectievelijk profielvalidatie of schemaspecifieke rekenregels.

## Gedeelde acceptatiecriteria voor nieuwe importers

- Herkennen op inhoud en versie, niet alleen op extensie `.xml` of `.xls`.
- Hiërarchie, bron-ID, omschrijving, oorspronkelijke eenheid, hoeveelheid en prijs behouden; onbekende eenheden niet stil naar `st` omzetten.
- Ontbrekend, nul, negatief en een formule zijn afzonderlijke gevallen. Lokale decimaalnotatie en encoding expliciet behandelen.
- Samengestelde prijzen en subtotalen niet dubbel tellen; valuta, opslagen en belastingen niet impliciet naar EUR/Nederland vertalen.
- Minstens een klein eigen fixture, een echt extern project en waar relevant een vraag/aanbieding-paar; rekenuitkomst vergelijken met de bronsoftware of een controle-uitdraai.
- Dezelfde parser via UI, library en MCP; expliciete warnings en behoud van het originele bestand bij onvolledige semantiek.

Er zijn tijdens dit onderzoek geen importers gewijzigd en geen compatibiliteitscertificeringen uitgevoerd.
