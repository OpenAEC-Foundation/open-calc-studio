# Test-begrotingen — importformaten

Geanonimiseerde, **volledig synthetische** voorbeeldbegrotingen voor het testen
van de importeurs. Geen herleidbare gegevens: alle projecten, opdrachtgevers en
posten zijn verzonnen.

| Bestand | Formaat | Importeur |
|---|---|---|
| `01-ifccalc-klein.ifcCalc` | Native OCS JSON (klein) | `deserializeProject` |
| `02-ifccalc-staart.ifcCalc` | Native OCS JSON (met staartkosten) | `deserializeProject` |
| `03-ifccalc-kengetallen.ifcCalc` | Native OCS JSON (met kengetallen) | `deserializeProject` |
| `04-dnc-stabu.dnc` | STABU-directiebegroting (7z + dBASE) | `importDncFile` |
| `05-dnc-stabu-groot.dnc` | STABU-directiebegroting (groter) | `importDncFile` |
| `06-xtb-ibis.xtb` | IBIS-TRAD (SQLite) | `importXtbFile` |
| `07-xtb-ibis-groot.xtb` | IBIS-TRAD (groter) | `importXtbFile` |
| `08-rsx-raw.rsx` | RAW-bestek (XML) | `importRsx` |
| `09-rsx-raw-klein.rsx` | RAW-bestek (klein) | `importRsx` |
| `10-xls-bascalc.xls` | BasCalc (Excel) | `importBasCalcFile` |

`manifest.json` bevat per bestand het verwachte totaalbedrag.

## Regenereren

```
node scripts/generate-test-fixtures.mjs
```

De generator is deterministisch (vast tijdstip, geen random) zodat opnieuw
genereren geen onnodige diffs oplevert. `src/test/fixtures.test.ts` verifieert
dat elk bestand via de echte importeur inleest en op het verwachte totaal uitkomt.
