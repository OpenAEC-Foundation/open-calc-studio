# Bestandsuitwisseling

Begin met een kopie van het bronbestand. Open of importeer het bestand in Open Calc Studio, lees alle waarschuwingen en vergelijk hoofdstukken, posten, eenheden, hoeveelheden, tarieven, staart en eindtotaal met de bron. Bewaar de bewerkbare versie vervolgens als nieuw `.ifcCalc`-bestand. Een export voor een ander programma is een apart uitwisselbestand; houd het native hoofdbestand aan.

| Formaat | Herkomst | In de huidige app |
| --- | --- | --- |
| `.ifcCalc`, `.ocs` | Open Calc Studio | Openen en opslaan |
| `.bc3` | Spanje, FIEBDC | Import en export |
| `.onlv`, `.onlb` | Oostenrijk, ÖNORM A 2063 | Import; ONLV-export |
| `.cuf`, `.rsx` | Nederland, CUF/RAW | Import en export |
| `.x81`, `.x82`, `.x83`, `.x86`, `.x87` | Duitsland, GAEB DA XML | Import van begrotingsstructuur |
| `.x84` | Duitsland, GAEB-aanbieding | Prijsovername op passend X83-bestek |
| `.xtb`, `.calc`, `.mdb` | IBIS/WpCalc/BasCalc | Afhankelijk van bronformaat import; WpCalc heeft ook een eigen export |

Bij GAEB kies je **Importeren → GAEB DA XML** voor het X83-bestek. Daarna pas je via **GAEB-aanbieding (.x84)** de prijzen toe. De positienummers moeten exact overeenkomen; ontbrekende of dubbele nummers laten de hele overname mislukken. Een X84 is geen zelfstandig bestek. Bijlagen, alternatieven en sommige vrije tekstvelden worden nog niet volledig bewaard. GAEB-export en BVBS-certificering ontbreken.

De app kan ook IFC-kostenstructuren uitwisselen. Een gewoon IFC-model bevat niet automatisch een begroting met calculatieregels. PDF-metingen kun je in het native begrotingsbestand bewaren; een PDF op zichzelf is geen prijsopbouw. De proprietaire formaten SIA 451/CRBX, PriMus DCF/XPWE en On-Screen Takeoff OST/OSP worden momenteel niet ondersteund.

Voor achtergrond, bronnen en bijgewerkte details: [internationale uitwisseling in de repository](https://github.com/OpenAEC-Foundation/open-calc-studio/blob/main/docs/wereldwijde-uitwisseling.md).
