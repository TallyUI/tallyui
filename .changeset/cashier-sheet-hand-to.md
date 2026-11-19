---
'@tallyui/components': minor
---

`CashierSheet` gains v2's "Hand the till to" and hold notices: the opt-in `handTo` prop (`CashierSheetHandTo`, `CashierSheetCashier`) lists the other cashiers with their open carts and calls `handTo.onHandTo(id)` when a row is pressed; `paying` shows "Finish the payment first" and holds the rows; `awaitingStore` shows the "Awaiting store" notice.
