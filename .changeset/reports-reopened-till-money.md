---
'@tallyui/pos': minor
'@tallyui/components': minor
---

Reports: the period sales report counts a reopened sale's till money only, leaving out what the store already held, as takings do, and the Z report's breakdowns flag `tax_includes_store_paid` when its tax rates include tax on amounts paid earlier in the store (`TAX_STORE_PAID_NOTE`).
The closure sheet shows that note when the flag is set.
