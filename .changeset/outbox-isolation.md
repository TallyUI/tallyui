---
'@tallyui/pos': minor
'@tallyui/components': minor
---

One order the store keeps failing no longer stops every later sale. After 5 server-answered failures (offline never counts) the order outbox probes the pending queue one order per backoff interval, oldest first; once the store takes one, the orders whose probes failed are isolated and retried alone, and batching resumes. If no probe gets through, the store is down: nothing is isolated. An order the store has kept failing for 15 minutes, on its own clock, is flagged as stuck and stays pending: `OutboxState.stuck`, `useOrderOutbox`'s `stuckCommandIds`, `needsAttention`'s `stuckCommandIds` option, `OrdersList`'s `stuck` prop, and `SyncStatus`'s "Not syncing" line.
