## Problem
A revised drawing can invalidate takeoff. Estimators need to see which measurements require review and what the accepted changes will do to the estimate before recalculation.

## Existing foundation and observed gap
`PdfViewer.tsx` already measures lengths and areas. `src/hooks/useQuantityLinkSync.ts` updates quantities from source values. `src/state/slices/versionSlice.ts` already compares estimate snapshots, but this is not drawing-revision comparison. No drawing revision registry, alignment workflow or before/after takeoff review was found.

## Proposed scope and dependency
Depends on persistent per-document takeoff (research item 01-persist-takeoff). Begin with two PDF revisions: page pairing, manual alignment, an overlay and a measurement review list. Keep previous geometry and quantities. Let users remap/redraw affected measurements and preview the resulting cost delta before accepting.

## Acceptance criteria
- [ ] Register old/new revisions of one drawing with stable identity, dates, page mapping and alignment/calibration.
- [ ] Overlay the selected pages with distinguishable colours and opacity controls; display removed/unpaired pages clearly.
- [ ] Keep prior measurements and identify those awaiting review; do not claim an image overlay automatically proves a measurement unchanged.
- [ ] Show old/new quantities and cost differences for linked items, chapters and the final estimate using the canonical calculator.
- [ ] Accept selected changes as an undoable batch or cancel without changing the estimate; retain the prior revision.
- [ ] Save/reopen preserves revision links and review status; tests cover page reorder, deleted geometry, scale changes and rejected revisions.

## Market evidence
[RIB's drawing-comparison explanation](https://www.rib-software.com/en/blogs/rib-costx-drawing-comparison-tool) describes overlays and comparisons between drawing revisions. It is an older vendor article, used as a workflow reference rather than a guarantee of current edition availability. The current [CostX product page](https://www.rib-software.com/en/rib-costx) also lists revision tracking.

## Priority and boundaries
Proposed P2 after persistent takeoff. Excludes automatic semantic PDF recognition and IFC/model revision matching; those can be separate follow-ups.

Research date: 2026-09-28. Vendor capabilities are documented claims, not independently tested. Existing open/closed issues were checked before drafting; no matching issue was found.
