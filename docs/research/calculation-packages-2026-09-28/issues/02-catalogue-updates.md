## Problem
Estimators need to update an old estimate with current rates without overwriting negotiated or project-specific prices. Copying a catalogue price once is insufficient for a controlled refresh.

## Existing foundation and observed gap
`src/state/slices/resourceLibrarySlice.ts` loads resource lists; `src/components/library/ResourcePicker.tsx` copies a default price into `normUnitPrice` and stores `resourceLibraryId`. `ResourceLibraryItem` in `src/types/costModel.ts` has no catalogue-version/effective-date provenance. `createProjectFile()` in `src/services/file/fileService.ts` currently writes an empty `resourceLibrary`. No selective catalogue-price refresh workflow was found in the inspected UI/state/services. Existing Excel quantity updates are a different workflow.

## Proposed scope
Introduce stable catalogue/item identifiers, versions, currency, units and effective dates. Persist the minimum provenance needed to reproduce applied prices. Provide a compare-and-apply screen for a user-supplied newer catalogue; no paid data service is required for the first implementation.

## Acceptance criteria
- [ ] Import two versions of a user-owned CSV/JSON catalogue and match items by stable identity, independent of list order.
- [ ] Preview old/new rates and cost impact per item and chapter before any change; show unmatched, ambiguous and unit/currency-incompatible entries separately.
- [ ] Explicitly overridden/locked prices are preserved unless the user selects them for replacement.
- [ ] Updating prices preserves quantities, productivity norms, labour-rate group rules and inactive estimate variants.
- [ ] Selectively apply changes as one undoable action; record source/version/date and old/new values using existing history facilities.
- [ ] Catalogue provenance and applied rates survive save/reopen and the library API round-trip.
- [ ] Tests cover reordered catalogues, duplicate codes, excluded overrides, incompatible units and reproducible cost totals.

## Market evidence
[2Jours' feature list](https://www.2jours.nl/prijzen-zzp/) explicitly lists price updating and user price lists. [Bidcon](https://elecosoft.com/us/products/bidcon/) describes custom cost libraries and supplier prices. Selective updates and provenance are proposed Open Calc Studio acceptance requirements, not claims about those products' implementations.

## Priority and boundaries
Proposed P1: frequent estimating workflow, building on an existing resource library. Excludes scraping third-party price databases, subscriptions, procurement and exchange-rate services.

Research date: 2026-09-28. Vendor capabilities are documented claims, not independently tested. Existing open/closed issues were checked before drafting; no matching issue was found.
