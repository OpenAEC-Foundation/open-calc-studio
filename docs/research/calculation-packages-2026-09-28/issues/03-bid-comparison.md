## Problem
A customer-facing quotation does not help a calculator compare incoming supplier/subcontractor quotes with different scopes. That comparison currently requires an external spreadsheet.

## Existing foundation and observed gap
`src/components/offerte/OfferteView.tsx`, `src/state/slices/offerteSlice.ts` and `src/services/offerte/offerteRequest.ts` support an outgoing offer, sections and payment terms. `CostItem.resourceType` already distinguishes subcontractors. No incoming bid/comparison domain model or UI was found in the inspected code. Reuse existing estimate IDs, calculator, history and native persistence rather than repurposing the outgoing offer document.

## Proposed scope
A work-package comparison table with multiple bidders, mapped estimate items, quoted quantities/rates, exclusions, notes, validity dates and explicit scope adjustments. Support manual entry and CSV import first. A calculator may select a preferred bid and apply it to selected estimate rows after preview.

## Acceptance criteria
- [ ] Compare at least three bids against the same scope and original budget, showing amount and percentage differences.
- [ ] Distinguish missing/unpriced items, explicit zero prices, exclusions and provisional allowances.
- [ ] Normalize supported units explicitly; reject or flag incompatible currencies/tax bases rather than ranking them silently.
- [ ] Display scope adjustments separately from the supplier's original quote and explain the normalized total.
- [ ] Select a preferred bid with a reason; preference need not follow the cheapest total.
- [ ] Preview and confirm write-back to selected estimate items, preserving originals in history/snapshot and allowing one-step undo.
- [ ] Save/reopen preserves bids and mappings; export a comparison report; test missing scope and write-back totals.

## Market evidence
[IBIS Offertes](https://ibiscalculeren.ibis.nl/bouw/help/moduleoffertevergelijksql.html) documents quote comparison and transferring a chosen offer back to an estimate. [IBIS Offertespiegel](https://ibiscalculeren.ibis.nl/bouw/help/offerte_spiegel.html) describes links to originating estimate rows.

## Priority and boundaries
Proposed P2, high practical value. Excludes emailing quote requests, placing orders and automatic contract award. No dependence on a hosted supplier portal.

Research date: 2026-09-28. Vendor capabilities are documented claims, not independently tested. Existing open/closed issues were checked before drafting; no matching issue was found.
