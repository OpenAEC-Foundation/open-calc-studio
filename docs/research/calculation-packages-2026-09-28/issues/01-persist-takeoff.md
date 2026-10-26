## Problem
Persistent PDF takeoff now exists locally, but a reviewer still needs a dependable revision identity and recovery path when a drawing or linked measurement is unavailable.

## Existing foundation and observed gap
The 2026-09-28 finding is superseded by the local implementation: `schedule.pdfWorkspace` persists embedded PDFs, per-page calibration, geometry and Open PDF Studio measurement provenance. Switching documents restores their own measurements. A linked quantity retains its last value when the source disappears, and the grid now shows an unresolved-source warning. The current source ID is a content hash, but no explicit drawing revision register, recovery/relink workflow or portable reference policy exists. These changes are local and were not yet published to the repository's GitHub branch at the 2026-10-05 audit.

## Remaining scope
Complete stable drawing and revision identities, a deliberate relinking/recovery workflow and a portable attachment/reference policy. Keep the existing embedded-PDF size limit explicit. Preserve measurement IDs when relinking the same source and require review before a different revision replaces it. Keep the last valid linked quantity and unresolved warning until the link is repaired.

## Acceptance criteria
- [x] Save and reopen embedded PDF geometry, calibration, measurement IDs and quantities in the native project file.
- [x] Isolate measurements between open projects and keep the last value when an individual or summed PDF source disappears; show an unresolved warning in the quantity cell.
- [x] Store geometry in unzoomed PDF coordinates.
- [ ] Give a drawing a stable identity distinct from its revision, and record revision metadata.
- [ ] Relink or recover missing PDFs/measurements without silently substituting a different revision; preview link changes.
- [ ] Specify attachment/reference rules for portable projects, including the existing 30 MB embedded-PDF limit.
- [ ] Verify older-file and core/isolated embed round-trips, multi-measurement totals and recovery through focused tests and desktop UI use.

## Market evidence
[GEstimator's README](https://github.com/manuvarkey/GEstimator/blob/master/README.md) describes recording measurement details against schedule items and exporting them with the estimate. [RIB CostX](https://www.rib-software.com/en/rib-costx) describes takeoff linked to estimate workbooks. These establish the traceability use case; the storage design above is our proposal.

## Priority and boundaries
Proposed P1: complete the foundation for dependable takeoff and drawing revisions. No automatic drawing recognition or IFC revision engine in this issue.

Research date: 2026-09-28; local implementation audited 2026-10-05. Vendor capabilities are documented claims, not independently tested. The public GitHub issue list was rechecked; no matching issue was found.
