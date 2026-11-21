---
"@tallyui/pos": minor
---

`reopenRefusedOrder` takes `closures`; a carried sale whose closed session's closure counted it reopens after close and is re-sent with its original time and register, no session and `countedInClosureOf`. `finalizeOrder` refuses `AFTER_CLOSE_PAYMENTS_CHANGED` when such a sale's payments changed.
