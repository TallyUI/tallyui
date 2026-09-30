---
"@tallyui/pos": patch
---

The order outbox stores each pending order's stuck clock and isolation in `serverFailures` and restores them when it starts, so after a restart an order the store keeps refusing no longer holds up the other sales, and its stuck flag keeps its start time.
