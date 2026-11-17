---
'@tallyui/pos': minor
---

A sale's `Order` can carry the store order it reopens (`storeOrder`), the store's ids for the lines, fees and shipping it keeps (`storeLineId`), and the payments the store already holds (`storePaymentId`, `locked`). These ids survive resume, re-tax, charge edits and line splits. A locked payment is never removed, voided or replaced by a tender. With no store ids set, nothing changes.
