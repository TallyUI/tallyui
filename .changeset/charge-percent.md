---
'@tallyui/pos': minor
---

A fee can be a percentage of the cart (`percent` on `addFee` and `updateFee`). The builder recomputes it from the lines after coupons on every change; a finalized order stores and sends its fixed amount.
