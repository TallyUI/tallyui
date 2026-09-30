---
'@tallyui/database': patch
---

The catalogue and fingerprint reconciles keep `lastCompleteAt` honest (#338).
- The fingerprint reconcile's `state$` moves `lastCompleteAt` only on a pass whose result is complete. A pass that read no pages, which gives `complete: false`, no longer stamps it.
- A new runner still shows the persisted value before its first pass.
- The catalogue runner's start-up load now updates `lastCompleteAt` only when the stored value is newer, so a load that resolves after a pass has completed can't roll it back.
