## Problem
Estimate variants currently compare monetary costs. Designers and calculators also need a transparent comparison of material-related carbon impacts without treating unknown factors as zero.

## Existing foundation and observed gap
`CostItem` already provides resources, quantities and variants. No carbon-factor fields, provenance model or carbon aggregation service was found in the inspected types/calculation/UI. Existing calculator totals must remain unaffected.

## Proposed scope
An optional pure calculation module accepting user-provided resource factors in kg CO2e per declared unit, with source/version and lifecycle-stage metadata. Start with a clearly bounded A1-A3 material comparison. Aggregate leaf resource quantities and present cost and carbon side by side for a selected variant. Do not describe this as certified LCA or Dutch MPG compliance.

## Acceptance criteria
- [ ] Store declared unit, factor, source, version/date and scope for each assignment; currency and carbon factors remain separate.
- [ ] Validate unit conversions and lifecycle boundary compatibility; expose unknown/missing factors as incomplete coverage, never implicit zero.
- [ ] Aggregate only applicable leaf resources and honour active variants without double counting parent totals or financial markups.
- [ ] A fixture with 10 m3 at 100 kg CO2e/m3 yields 1,000 kg CO2e; a missing factor yields an explicit incomplete result.
- [ ] Save/reopen preserves provenance; export a report listing assumptions, coverage and source factors.
- [ ] Core/library functions are deterministic and tested; enabling the module leaves monetary totals unchanged.

## Market evidence
[RIB CostX](https://www.rib-software.com/en/rib-costx) advertises embodied-carbon estimating and EC3 rate-library support. The limited A1-A3 MVP and validation rules above are our design proposal, not a claim about CostX's calculation method.

## Priority and boundaries
Proposed P3, exploratory. Excludes automatic retrieval of licensed datasets, full lifecycle certification and regulatory compliance claims. Broader lifecycle stages require separately defined scope and review.

Research date: 2026-09-28. Vendor capabilities are documented claims, not independently tested. Existing open/closed issues were checked before drafting; no matching issue was found.
