---
name: open-calc-studio-mcp
description: Use when aansturen van Open Calc Studio via MCP/API — begroting openen/bouwen, posten of regels toevoegen, prijzen/uren wijzigen, opslaan, of wanneer bedragen in de verkeerde kolom belanden (loon vs materiaal, uren leeg) of ids ineens niets meer matchen.
---

# Open Calc Studio aansturen via MCP

## Overview
De MCP-server houdt één begroting in geheugen en pusht mutaties live naar de app. Vaste cyclus: `open_budget(pad)` → muteren → `recalculate` → `save_budget(pad)`. **Sla na elke batch op** — niets is persistent tot save_budget.

## Workflow
1. `open_budget(filePath)` — .ifcCalc/.ocs/.ifcx native; .calc/.xtb worden geïmporteerd
2. `get_items(...)` — ids ophalen (zie ID-regel!)
3. `add_chapter` → `add_item(rowType begrotingspost)` → `add_item(rowType regel, parentId=post)`
4. `recalculate` → controle via `get_budget_summary`
5. `save_budget(filePath)` — zelfde pad, altijd

## ID-regel (kost je anders een dwaalspoor)
**Elke `open_budget` genereert verse ids voor imports (.calc/.xtb) en vervangt de in-memory set.** Gebruik nooit ids uit een eerdere open; haal ze opnieuw op met `get_items`. Symptoom van stale ids: `get_items(parentId=…)` geeft 0 terwijl het hoofdstuk wél een totaal heeft.

## Veldsemantiek per regeltype (DE kern)
| Regeltype | Velden | NIET doen |
|---|---|---|
| Materiaal/inkoop | `quantity`, `unit`, `normUnitPrice`=prijs/eenh, `resourceType` materiaal·onderaannemer·materieel·overig | — |
| **Arbeid (eenheid 'uur')** | `quantity`=uren, `normQuantity:1`, `tariefGroep` A/B/C, `laborPrice`=tarief (A 66 · B 46 · C 82), `normUnitPrice:null`, `resourceType:'arbeid'` | tarief in `normUnitPrice` → bedrag landt in **materiaal**-kolom en uren blijven leeg |
| Norm-gedreven (per m²) | `quantity`=m², `normQuantity`=uren/m², `tariefGroep`, `laborPrice`=tarief, `normUnitPrice`=materiaal/m² | norm zetten zónder laborPrice → calculator doet `qty×norm×prijs` (multiplier-model): bedrag explodeert (bv. 8×€2.267) |
| Machine-uren (kraan) | als materiaalregel: `normUnitPrice`=huurtarief/u, `resourceType:'materieel'` | als loon boeken |
| Stelpost | levering-regel (bedrag, OA/overig) + aparte montage-regel (arbeid) | één regel met alles |

`resourceType:'onderaannemer'` telt mee in de AK-over-OA-grondslag — altijd zetten bij uitbesteed werk.

**laborPrice-valkuil:** `add_item` kent géén laborPrice-parameter; de server leidt hem af uit `tariefGroep` — maar alléén als `schedule.tarieven` bestaat. Bij .ifcCalc-bestanden zonder tarieven blijft laborPrice dan 0 en grijpt het multiplier-model. Controleer na de add of `laborPrice` gevuld is; zo niet → `update_item(id,{laborPrice: tarief})` expliciet.

## Volgorde & structuur
- Nieuwe hoofdstukken komen achteraan → sorteer op nummer met `move_items(ids,[targetId],'before'|'after')`.
- Prijs nooit op post/hoofdstuk; containers krijgen hun totaal bottom-up.
- `update_item(id,{changes})` voor correcties; `null` wist een veld.

## Multi-document
De MCP kent één "huidige" begroting; `open_budget` vervangt die en de app opent een **extra tab** (oude tab blijft staan). `list_documents` toont alleen MCP-eigen tabs — niet 1-op-1 de app-tabs. Wissel je van bestand: daarna weer terug-openen vóór verdere mutaties.

## Verifiëren
- Na recalc: `get_budget_summary` — klopt kostprijs/hoofdstuktotalen?
- Loonregel goed? In het item-resultaat: `laborPrice` gevuld, `normUnitPrice` null, `unitPrice = qty × laborPrice`.
- Bij UI-twijfel: screenshot van het app-venster (PrintWindow) en kijken.

## Common mistakes
| Fout | Symptoom | Fix |
|---|---|---|
| Uurtarief in normUnitPrice | loon onder materiaal, uren-kolom leeg | arbeid-velden (zie tabel) |
| normQuantity=uren op stuksregel | total = uren × stuksprijs (8×2267) | norm=uren/eenheid óf splitsen |
| Oude ids na heropen | get_items(parentId)=0, "orphans" | ids vers ophalen |
| Vergeten save_budget | wijzigingen weg na herstart | na elke batch opslaan |
| Hoofdstuk blijft achteraan | nummering uit volgorde | move_items before/after |
