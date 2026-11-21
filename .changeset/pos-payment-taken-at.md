---
'@tallyui/pos': minor
---

A payment leg records `takenAt`, the instant the leg was captured, and keeps it through park, resume, reopen and the stored order. A leg added captured gets it at once; a pending or authorized leg gets it on capture; the pre-filled tender gets it at `complete()`. A value that is not an ISO instant is dropped, never the payment. `OrderBuilder.setPaymentStatus` takes an optional `takenAt`, set only on a move to captured. `pos_orders` moves to version 20 (identity migration, opened through `addPosOrderCollection`); like every pos_orders bump it is one-way.
