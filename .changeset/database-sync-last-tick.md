---
'@tallyui/database': minor
---

SyncCadenceRunner exposes its last finished tick (`lastTick$`, `lastTick()`: the time, and ok or error), for WCPOS v2's "last check X ago" line. A target may return a promise from `reSync()`; a rejection marks the tick as an error.
