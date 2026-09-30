---
'@tallyui/pos': minor
'@tallyui/components': patch
---

The "since" a cashier reads is a real time (#253). `OutboxState.stuck` (both outboxes) gains `firstFailedAt`: the wall-clock time the first failure of the current stuck run was answered, so an offline gap no longer moves it. `since` keeps its meaning, the clock's virtual start, and still drives the 15-minute threshold. `firstFailedAt` is kept in memory only. After a restart it is absent, and `SyncStatus` and `OrdersList` show the stored time instead, worded "since about 2:49 AM".
