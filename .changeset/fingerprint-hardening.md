---
"@tallyui/core": minor
"@tallyui/database": minor
---

`ReconcileFeedEntry` (core) gains `refreshOnly?: boolean`: a missing product is skipped instead of tombstoned when its entry is refresh-only, so only the id reconcile's braked entries can delete (ADR-060, backlog 43). Merging in `enqueue` keeps `refreshOnly` true only when every entry queued for that id was refresh-only, so a deletable id-reconcile entry is never downgraded by a later refresh-only one. The fingerprint runner (`startFingerprintReconcile`, database) now enqueues its entries this way; the id runner is unchanged.

`FingerprintReconcileState` (database) gains `lastResultAt`/`lastErrorAt`, stamped from an injectable `now` (default `Date.now`), so a kept `lastResult` next to a newer `lastError` can be told apart from a current one. The new `isFingerprintResultCurrent(state)` helper does that comparison (backlog 46).
