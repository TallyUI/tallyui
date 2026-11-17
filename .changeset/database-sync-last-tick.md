---
'@tallyui/database': minor
---

`startSyncCadence` now returns a `SyncCadenceTicker`: a `SyncCadenceRunner` that also exposes its last finished tick (`lastTick$`, `lastTick()`: the time, and ok or error), for WCPOS v2's "last check X ago" line. `SyncCadenceRunner` itself is unchanged, so existing fakes still type-check. A target may return a promise from `reSync()`; a rejection marks the tick as an error.
