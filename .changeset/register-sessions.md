---
"@tallyui/pos": minor
---

Adds register sessions (ADR-032, registers job a2), ported from WCPOS `next` at `3b5331b5c`: three local-only collections (`registerSessionSchema` with `registerSessionCollection`, `cashMovementSchema`, `closureSchema`), the session write path (`openSession`, `startCounting`, `backToSelling`, `closeSession`, `recordMovement`, `voidMovement`, `requireOpenSession`, `writeClosure`), and the register document for the till's identity, store binding and counters (`ensureRegister`, `bindRegister`, `nextSaleCounter`, `mintClosureNumber`, `advancePerpetual`). A `PosOrder` carries an optional `sessionId`, set by `stampSession` and never sent. **`posOrderSchema` is now version 1** (the optional `sessionId`): create `pos_orders` with the new `posOrderCollection()`, which carries its identity migration; with `posOrderSchema` alone, RxDB refuses the collection.

A closed session is final: nothing moves it out of `closed` (`RegisterSessionClosedError`), a repeat `closeSession` is a no-op, `recordMovement` and `voidMovement` take the sessions collection first and refuse a missing or closed session, and `writeClosure` refuses a session that is not closed.
