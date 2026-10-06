---
'@tallyui/pos': minor
---

Fees, shipping and custom lines on the order (ADR-075 phase a):
`useSale` `addFee`, `addShipping`, `addCustomLine` and their update/remove, with tax, totals, display and receipt
rows. Orders carrying them can't be completed until a later release sends `order.create` version 5.
