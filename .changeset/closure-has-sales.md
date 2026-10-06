---
'@tallyui/pos': patch
---

`buildClosureDocument`'s `has_sales` is true only when the period had a sale or refund (it was true for every closure, because the period totals are always strings such as "0.00").
