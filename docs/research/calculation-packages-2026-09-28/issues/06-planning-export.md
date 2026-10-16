## Problem
Calculators retype estimate scope and labour effort into planning software. An open export can transfer that information while keeping project scheduling in a dedicated planning tool.

## Existing foundation and observed gap
Cost items, hierarchy, labour norms and rate groups already exist in `src/types/costModel.ts` and the calculation service. The field name CostSchedule means the cost estimate here; it does not supply a construction task/dependency/calendar model. No planning task export was found in the inspected export services.

## Proposed scope
Create a pure mapping from a selected estimate variant to work packages with stable IDs and labour effort. Expose CSV/JSON export from the UI and library. Support optional crew size and working hours/day for a clearly labelled indicative duration; do not infer an approved schedule.

## Acceptance criteria
- [ ] Export selected work packages with stable IDs, parent IDs, codes, descriptions, quantity/unit and calculated labour hours.
- [ ] Include estimate/variant identity, export timestamp and units; retain IDs across subsequent exports for downstream reconciliation.
- [ ] Do not double count parent aggregates and child effort; inactive variants and staart rows are excluded by explicit rules.
- [ ] Labour effort remains distinct from elapsed duration. Duration is empty unless required crew/calendar assumptions are supplied and shown.
- [ ] Document the schema and provide a sample external consumer; tests verify effort conservation and stable IDs.

## Market evidence
[Bidcon](https://elecosoft.com/us/products/bidcon/) describes generating a schedule in Asta Powerproject from an estimate. [2Jours](https://www.2jours.nl/prijzen-zzp/) lists taking tasks from a calculation into planning. These support interoperability; they do not imply compatibility with a proposed CSV schema.

## Priority and boundaries
Proposed P3: useful integration after the core estimating improvements. Excludes a native Gantt editor, critical-path engine and a promise of compatibility with proprietary planning formats.

Research date: 2026-09-28. Vendor capabilities are documented claims, not independently tested. Existing open/closed issues were checked before drafting; no matching issue was found.
