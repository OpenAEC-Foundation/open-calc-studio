# BasCalc XLS Datastructuur

## Bestand
`Reiniging riolering turbinehal en aanleg riolering 6-10-22.xls`
BasCalc v8.3 (release 083-145), Beuvink Advies en Service

## 6 Sheets

| # | Sheet | Rijen | Kolommen | Doel |
|---|-------|-------|----------|------|
| 0 | Menu | 22 | 52 (A-AZ) | Project/bedrijfsgegevens + configuratie |
| 1 | Kostprijs | 382 | 19 (A-S) | Kostenberekening met middelen (hoofddata) |
| 2 | Middelen | 154 | 12 (A-L) | Middelen geaggregeerd per middelencode |
| 3 | Eindblad | 88 | 25 (A-Y) | Eindoverzicht: opslagpercentages (AK, W&R, UVK, Afronding) |
| 4 | Inschrijfstaat | 123 | 19 (A-S) | Inschrijfstaat (klantweergave) |
| 5 | _xl | 126 | 26 (A-Z) | Interne BasCalc config, variabelen, middelentabel |

---

## 1. Menu Sheet (22 rijen)

### Structuur
- **Rij 1**: Marker `%_vrij_%`
- **Rij 2**: Config string (vergrendeling, entiteitsfilter). Kol H: `BasCalc v8.3`
- **Rij 3**: Versie = 1
- **Rij 6**: Samenvatting: `Kostprijs / Inschrijfstaat = 65.278,29 / 78.250,00`
- **Rij 22**: Eindmarker `%_BasCalc_%`

### Projectgegevens (rijen 8-12)
| Veld | Cel |
|------|-----|
| Project | F8 |
| Werknummer | J8 |
| Valuta | J9 |
| Opdrachtgever | F10 |

### Bedrijfsgegevens (rijen 14-21)
| Veld | Cel |
|------|-----|
| Bedrijf | F14 |
| Postadres | F15 |
| Postplaats | F16 |
| Bezoekadres | F17 |
| Bezoekplaats | F18 |
| Telefoon | F19 |
| Fax | F20 |
| E-mail | F21 |

---

## 2. Kostprijs Sheet (382 rijen) - KERNDATA

### Kolomindeling (rij 3 = headers)
| Kol | Header | Doel |
|-----|--------|------|
| A | (regeltype) | `ih`, `cb`, `cn`, `cp` |
| B | (niveau/vlag) | Meestal "0" voor ih |
| C | Code | Bestekspostnummer (bv. "100010", "1", "10") |
| D | Omschrijving / Middel | Beschrijving of middelnaam |
| E | aantal | Aantal vermenigvuldiger middel |
| F | norm | Normwaarde (vaak uren per eenheid) |
| G | (deler) | Altijd "/" |
| H | hv-post | Uren-per-post of "p" of "t" |
| I | Hoeveelheid | Hoeveelheid |
| J | Eh. | Eenheid (keer, uur, m3, st, dgn, %) |
| K | S | Stelpostvlag: "N"=Nee, "V"=Verrekenbaar |
| L | Prijs middel | Eenheidsprijs middel |
| M | Eh.prijs post | Berekende eenheidsprijs post |
| N | Bedrag post | Berekend totaal post |
| O | (subtotaal cb) | Kopie van N op `cb`-rijen |

### Regeltypen (kolom A)

| Code | Aantal | Betekenis |
|------|--------|-----------|
| `ih` | 97 | **Item Header** - bestekspost (code, omschrijving, hoeveelheid, eenheid, eenheidsprijs, totaal) |
| `cb` | 90 | **Calculatie Berekening** - calculatieblok header per middelengroep |
| `cn` | 118 | **Calculatie Norm** - individueel middel/resource (code, naam, hoeveelheid, norm, prijs) |
| `cp` | 74 | **Calculatie Punt** - einde calculatieblok |

### Hiërarchiepatroon (herhaalt per bestekspost)
```
ih  → Bestekspost (zichtbaar in inschrijfstaat)
  cb  → Calculatieblok header (per middelengroep)
    cn  → Middel 1
    cn  → Middel 2
  cp  → Einde blok
  cb  → Nog een blok (indien meerdere groepen)
    cn  → Middel
  cp  → Einde blok
ih  → Volgende bestekspost
```

### cn Berekeningsformule
`E × F / H` = hoeveelheid per eenheid → × `I` (totaal qty) × `L` (prijs) = `N` (totaal)

### S-codes (kolom K)
| Code | Betekenis |
|------|-----------|
| `m` | Manuren (arbeid) |
| `h` | Huur/materiaal |
| `N` | Geen stelpost |
| `V` | Verrekenbaar |

### Speciale posten onderaan
| Code | Omschrijving | Eenheid |
|------|-------------|---------|
| 929990 | Uitvoeringskosten 6% | % |
| 939990 | Algemene kosten 9% | % |
| 949990 | Winst 4% | % |
| 959990 | Afronding | % |

---

## 3. Middelen Sheet (154 rijen) - Middelen geaggregeerd

### Regeltypen
| Code | Aantal | Betekenis |
|------|--------|-----------|
| `cv` | 5 | **Categorie header** - middelencategorie (D=code, E=naam, I=totaal) |
| `ct` | 27 | **Categorie totaal** - middel subtotaal (D=code, E=naam, F=totaal qty, H=gem.prijs, I=totaal) |
| `cn` | 118 | **Individueel gebruik** - elk gebruik van middel in een bestekspost |

### Categorieën
| Code | Categorie | Totaal |
|------|-----------|--------|
| 0 | MANUREN | 6.999,96 |
| 1 | MACHINE-UREN | 12.224,18 |
| 2 | ZAND, GRIND FRANKO | 352,50 |
| 3 | ONDERAANNEMING | 29.063,75 |
| 9 | DIVERSEN | 11.861,65 |

---

## 4. Eindblad Sheet (88 rijen) - Opslagen

### Totalen (rijen 5-8)
- Tot_Kostprijs = 65.278,29
- Aanneemsom = 78.250,00
- Subt_Inschrijfstaat = 54.277,73

### Opslagregels (rijen 20-24)
| Code | Omschrijving | Basis | % | Bedrag |
|------|-------------|-------|---|--------|
| 959990 | Afronding | Tot_Kostprijs | - | -4,59 |
| 929990 | Uitvoeringskosten | Tot_Kostprijs | 6% | 3.916,70 |
| 939990 | Algemene kosten | Tot_Kostprijs | 10% | 6.527,83 |
| 949990 | Winst | Tot_Kostprijs | 4% | 2.611,13 |
| 959990 | Afronding | Tot_Kostprijs | - | -78,73 |

Kolomstructuur: I=Code, K=Omschrijving, N=basis ref, O=basis bedrag, P=percentage, Q=procentueel bedrag, R=absoluut bedrag

---

## 5. Inschrijfstaat Sheet (123 rijen) - Klantweergave

Bevat alleen `ih`-rijen (afgeplatte weergave zonder middelen).

Kolommen: C=Bestekspostnr, D=Omschrijving, E=Eenheid, F=Hoeveelheid, H=Eenheidsprijs, I=Totaal, J=Kostprijs, K=Bedrag post

Rij 104: Aannemingssom = 78.250,00 EUR (Kostprijs = 65.278,29, opslag = 19,87%)

---

## 6. _xl Sheet (126 rijen) - Interne Config

- Rij 12: 90 cb's, 118 cn's
- Rijen 50-59: Regeltypecodes (is, ic, ih, io, bh, bo, br, cb, cn, cp)
- Rijen 101-105: Sheetnamen
- Rijen 102-108 kol C-D: Categoriecode → naam mapping
- Rijen 101-126 kol H-K: Complete middelentabel (code, naam, S-code)
- Rij 31 kol B: configpad = `C:\basware\bascalc`

### Extra regeltypecodes (gedefinieerd maar niet altijd gebruikt)
| Code | Vermoedelijke betekenis |
|------|------------------------|
| `is` | Item Subhoofdstuk |
| `ic` | Item Chapter |
| `io` | Item Opmerking |
| `bh` | Blad Header |
| `bo` | Blad Opmerking |
| `br` | Blad Regel |
