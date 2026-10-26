# Begrotingen omzetten naar en vanuit .ifcCalc

De module `@openaec/open-calc-studio/converters` werkt in Node en browsers, zonder React of DOM.

| Formaat | Naar .ifcCalc | Vanuit .ifcCalc |
|---|---|---|
| XPWE | Posten, categorieën, hoeveelheden, Prezzo1 | Naar ingebed XPWE-bronbestand; ondersteunde veldwijzigingen |
| XC4 4.4 | Objecten, onderdelen, posten, hoeveelheden, joc | Naar ingebed XC4-bronbestand; ondersteunde veldwijzigingen |
| OCS CSV/XLSX-tabel | Alle tabelvelden, ouders, lege bedragen | Nieuwe neutrale tabel met hoofdstukken en directe prijzen |
| Andere CSV/XLSX/XLS-bladen | Expliciet kolomprofiel en aaneengesloten postbereik | Neutrale OCS-tabel, **niet** het nationale aanbestedingssjabloon |
| ATH, NS3459, CRBX, GGE en overige onderzochte standaarden | Nog geen converter in deze module | Nog geen converter in deze module |

XPWE en XC4 zijn in Bestand → Importeren beschikbaar. Na import staat onder Exporteren de knop **Terug naar XPWE/XC4**. De bestaande native bestandsfunctie slaat de begroting en het bronbestand samen op in `.ifcCalc`.

## Bibliotheek

```ts
import { convertToIfcCalc, convertFromIfcCalc } from '@openaec/open-calc-studio/converters';

const native = convertToIfcCalc(sourceBytes, 'begroting.xpwe', { currency: 'EUR' });
// native.data: Uint8Array; native.fileName; native.warnings
const back = convertFromIfcCalc(new TextDecoder().decode(native.data), 'xpwe');
const table = convertFromIfcCalc(new TextDecoder().decode(native.data), 'xlsx');
```

Bewerk het project eventueel met `deserializeProject` en de bestaande calculatiefuncties uit `./core`. Geef het projectobject of opgeslagen JSON aan `convertFromIfcCalc`. Bewaar en toon `warnings` aan de gebruiker.

Voor een regionaal spreadsheet is de mapping expliciet; er wordt geen nationale besteksstructuur geraden:

```ts
const native = convertToIfcCalc(bytes, 'begroting.xlsx', {
  profile: {
    sheet: 'BOQ', firstRow: 8, lastRow: 50,
    currency: 'ZAR', decimalSeparator: '.',
    columns: { code: 0, description: 1, unit: 2, quantity: 3, price: 4 },
  },
});
```

Rijen zijn één-gebaseerd, kolommen nul-gebaseerd. Het bereik moet alleen posten bevatten: koppen, subtotalen en toelichtingen worden niet stilzwijgend meegenomen. Getallen met onduidelijke duizendtalscheiding worden geweigerd. Formules gebruiken bestaande cachewaarden; eerst in de bronapp herberekenen. De neutrale export neemt de bronopmaak, macro's en formulelogica niet over.

## Commandoregel vanuit deze repository

```sh
npm run convert:budget -- input.xpwe output.ifcCalc EUR
npm run convert:budget -- input.xml output.ifcCalc CZK
npm run convert:budget -- input.ifcCalc output.xpwe
npm run convert:budget -- input.ifcCalc output.xc4
npm run convert:budget -- input.ifcCalc output.xlsx
npm run convert:budget -- input.xlsx output.ifcCalc profile.json
```

Een `.xml`-uitvoer betekent XC4. Bestaande uitvoerbestanden worden niet overschreven. De JSON-uitvoer vermeldt conversiewaarschuwingen.

## Betekenis en grenzen

- Dit zijn **directe postkosten**. Belasting, opslagen, meetformules en middelenanalyses worden niet als Nederlandse staart geïnterpreteerd. Bij heropenen worden geen standaard Nederlandse opslagen toegevoegd.
- Zonder valuta-optie neemt de XML-import EUR voor XPWE en CZK voor XC4 aan, met waarschuwing. Er vindt geen valutaconversie plaats.
- Onbekende XML-eenheden worden als `post` getoond, met waarschuwing; de oorspronkelijke eenheid blijft in het bronbestand. Geen hoeveelheid- of prijsconversie naar een andere eenheid.
- XPWE gebruikt `Prezzo1`. Een eventuele `PercPrezzi`-correctie wordt gemeld en niet toegepast. XC4 gebruikt `joc`. Nulprijzen kunnen een ongeprijsd bestek betekenen.
- Ongewijzigde UTF-8 XML komt byte-identiek terug, inclusief BOM. Ondersteunde wijzigingen zijn postcode, omschrijving, bekende eenheid, hoeveelheid, directe materiaalprijs en projectnaam; XC4 ook postnotities. De bronstructuur blijft bewaard. XML-comments en processing instructions worden bij gewijzigde export niet gereproduceerd.
- Bij XPWE wordt een gedeelde prijslijstregel gekopieerd voordat één post wordt aangepast. Gewijzigde hoeveelheden krijgen één meetregel. Verwijzingen vanuit andere meetregels blokkeren de wijziging. Een gewijzigde prijs kan een middelenanalyse afvlakken, met waarschuwing.
- Een gewijzigde XC4-hoeveelheid wist de meetuitdrukking en neemt de expliciete hoeveelheid over. Bronvelden die de app niet kent blijven behouden; afgeleide leveranciersvelden kunnen opnieuw berekening in de bronapp nodig hebben.
- Nieuwe/verwijderde/verplaatste/hernummerde sorteerrijen, hoofdstukwijzigingen, valuta-aanpassingen en nieuwe norm-/middelenprijzen worden bij XML-terugexport geweigerd. Nieuwe native begrotingen kunnen naar de neutrale tabel; er is geen vrije XPWE/XC4-generator zonder bronbestand.
- De neutrale tabel ondersteunt hoofdstukken en directe posten. Middelen, normen, varianten en staartregels worden geweigerd in plaats van ongemerkt weggelaten. Aanvullende projectmetadata zoals PDF's en offertes hoort niet bij dit tabelformaat.
- CSV met formuleachtige tekst wordt geweigerd; XLSX bewaart deze als tekst.
- Terugexport is nog **niet in PriMus/Aspe of tegen leveranciersschema's gevalideerd**. De tests bewijzen de beschreven veldconversie, niet volledige compatibiliteit met alle leveranciersversies.

## Verificatie

`src/test/budgetConversion.test.ts` test bedragen, lege/ongeldige waarden, gedeelde prijsreferenties, wijzigingen, blokkades, UTF-8/BOM, CSV/XLSX en opgeslagen/heropende native bestanden.

Optionele controle met de eerder gedownloade openbare voorbeelden:

```sh
node scripts/verify-budget-fixtures.mjs /pad/naar/global-estimate-formats-2026-10-09
```

Die controle verwacht Palazzo Poggi (844 posten), Kadaň fase 1 (88 posten) en fase 2 (578 posten). Ze controleert byte-identieke terugexport na opslaan, heropenen en herberekenen. Externe bronbestanden worden niet met deze repository verspreid; herdistributierechten zijn niet vastgesteld. Bronlinks staan in `docs/research/worldwide-formats-2026-10-09.md`.
