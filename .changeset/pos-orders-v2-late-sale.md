---
"@tallyui/pos": minor
"@tallyui/components": minor
---

`pos_orders` goes to schema version 2 (ADR-032, ADR-065). It adds three optional fields: `lateSessionId`, and ADR-065's `display` and `taxByRate`, which nothing writes yet. Apps must adopt this release's `addPosOrderCollection`, which migrates `pos_orders` to version 2 from version 0 or 1 without dropping an order.

A sale whose session refuses the stamp in `useSale().complete()` (the session closed or went missing) is no longer stopped, because the money has been taken. It goes on to `onSaleCompleted` and the receipt with `lateSessionId` set and no `sessionId`, so no closure counts it, and a `late-sale` register fact is recorded. `needsAttention` now also selects any order with `lateSessionId`, and `OrdersList` explains it: "Taken after the register closed. It is not in that register's closure."
