---
"@tallyui/pos": minor
"@tallyui/core": minor
"@tallyui/components": minor
---

A cash payment that settles a sale under its method's rounding records the difference in `Order.cashRoundings`, counted in the total and stored in `pos_orders` 21 (identity migration). A rounded sale needs a store whose connector declares the `cashRounding` capability on `ServerCapabilities`; without it the till does not round, finalize refuses an order with entries, and `precheckCommand` refuses `cashRoundings` as `invalid_payload`.
