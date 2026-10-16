## Problem
A report named nacalculatie exists, but post-project cost control needs separate actual transactions and a fixed baseline. Editing estimate rows to reflect actuals destroys the original comparison.

## Existing foundation and observed gap
`src/services/print/printService.ts` renders the existing nacalculatie view using estimate items and calculated totals. `CostItem` and `ProjectFile` have no actual transaction ledger. Snapshots, resource types and bewakingspost rows provide a starting point. No actual-hours/material-cost import and reconciliation flow was found in the inspected code.

## Proposed scope
Import actual hours and costs from CSV into a separate per-project ledger, mapped to stable cost item/bewakingspost identifiers. Compare against an explicitly selected baseline snapshot. Start with a read-only comparison report; do not build accounting or payroll.

## Acceptance criteria
- [ ] CSV mapping supports an external transaction ID, date, cost code, resource type, amount, currency and optional hours.
- [ ] Reimport is idempotent and ambiguous/unmapped rows require review; corrections and credit amounts are represented explicitly.
- [ ] Baseline, actuals and variance are shown by chapter/bewakingspost/resource type, with clear period and tax basis.
- [ ] Labour hours and labour amounts remain separate; imported labour cost is not counted again when hours are present.
- [ ] Missing mappings/currency mismatches are visible; original estimate and baseline remain unchanged.
- [ ] Persist the ledger and mapping; export the comparison; tests cover duplicates, credits, unmapped codes and parent/child double counting.

## Market evidence
[2Jours](https://www.2jours.nl/onze-mogelijkheden/) describes booking hours/materials to projects. [RIB Presto](https://www.rib-software.com/es/rib-presto) describes execution tracking and real-cost analysis. The scoped import-and-report workflow is our proposed first step.

## Priority and boundaries
Proposed P2. Excludes invoicing, bank connections, payroll and earned-value forecasting in this first issue.

Research date: 2026-09-28. Vendor capabilities are documented claims, not independently tested. Existing open/closed issues were checked before drafting; no matching issue was found.
