---
"@tallyui/pos": minor
---

Adds register sessions (ADR-032, registers job a2), ported from WCPOS `next` at `3b5331b5c`: three local-only collections (`registerSessionSchema` with `registerSessionCollection`, `cashMovementSchema`, `closureSchema`), the session write path (`openSession`, `startCounting`, `backToSelling`, `closeSession`, `recordMovement`, `voidMovement`, `requireOpenSession`, `writeClosure`), and the register document for the till's identity, store binding and counters (`ensureRegister`, `bindRegister`, `nextSaleCounter`, `mintClosureNumber`, `advancePerpetual`). `finalizeOrder` takes a `sessionId`, stored on the `PosOrder` and never sent. **`posOrderSchema` is now version 1** (the optional `sessionId`): create `pos_orders` with the new `posOrderCollection()`, which carries its identity migration; with `posOrderSchema` alone, RxDB refuses the collection.
