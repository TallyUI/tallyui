---
'@tallyui/pos': minor
'@tallyui/components': minor
---

One order the store keeps failing no longer stops every later sale. After 5 server-answered failures (offline never counts) the order outbox probes the pending queue one order per backoff interval, oldest first; once the store takes one, the orders whose probes failed are isolated and retried alone, and batching resumes. If no probe gets through, the store is down: nothing is isolated. Retries alternate between the batch (or the probe) and one due isolated order, one request per interval, so neither can starve the other, and isolated orders take turns. An order the store has kept failing for 15 minutes of answered time, on its own clock (an offline failure pauses it), is flagged as stuck and stays pending: `OutboxState.stuck`, with a per-order entry in `stuck.orders`, `useOrderOutbox`'s `stuckCommandIds`, `needsAttention`'s `stuckCommandIds` option, `OrdersList`'s `stuck` prop (each order with its own time and reason), and `SyncStatus`'s "Not syncing" line.
