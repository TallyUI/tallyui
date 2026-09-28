---
"@tallyui/core": minor
"@tallyui/pos": minor
---

Add `order.create` envelope version 3, its display and tax-rate wire types, and the payload's `sessionId` and customer reference.

At capability 3, `finalizeOrder` copies the receipt's `display` and `taxByRate` into the sale. Version 3 sends those figures and the sale's session (stamped or late) as `sessionId`. Older orders keep their existing envelope version.

Move `pos_orders` to schema version 3 with a `sessionId` index. Apps must open `pos_orders` with `addPosOrderCollection`, which migrates it.
