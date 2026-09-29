---
'@tallyui/pos': minor
'@tallyui/components': minor
---

One order the store keeps failing no longer stops every later sale. After 5 server-answered failures (offline never counts) the order outbox probes the batch one order per backoff interval; once the store takes one, it sends the rest alone and isolates the orders that still fail, retrying them alone. If no probe gets through, the store is down: nothing is isolated. An order the store has kept failing for 15 minutes is flagged as stuck and stays pending: `OutboxState.stuck`, `useOrderOutbox`'s `stuckCommandIds`, `needsAttention`'s `stuckCommandIds` option, `OrdersList`'s `stuckCommandIds`, `stuckReason` and `stuckSince` props, and `SyncStatus`'s "Not syncing" line.
