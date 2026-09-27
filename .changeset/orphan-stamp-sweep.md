---
"@tallyui/pos": patch
---

A sale stamped with a register session that then closed, and stored after that session's closure was frozen without it, no longer sits on no Z. The new `sweepOrphanStamps` turns each such order into a late sale: it removes `sessionId`, sets `lateSessionId` and logs one `late-sale` fact. It never changes the closure, an order the closure lists, an order whose session has no closure yet, a late order or another register's orders. `useRegisterSession` runs it on start, after each close's closure, and whenever a new closure appears. `voidMovement` takes an optional `closures` collection and re-reads the session after its writes. If the session closed meanwhile and no closure lists the reversal, it throws `RegisterMovementStrandedError`, and it always does so when `closures` isn't passed. The reversal is kept either way.
