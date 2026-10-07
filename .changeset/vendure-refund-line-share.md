---
'@tallyui/connector-vendure': patch
---

A refund line's amount is now its cumulative share of the line total, the vendurepos plugin's rule (ADR-080 amendment 2). `getVendureOrder` also reads each line's `proratedLinePriceWithTax`. `vendureRefundable` gives each line `lineTotalWithTax`, and the new `vendureLineRefundWithTax(line, quantity)` returns `round((r + q) × T / N) − round(r × T / N)`. A whole-line refund is now exactly the line total; per-unit `unitRefundWithTax` could miss it by a few minor units, and the plugin refused it with `amount_mismatch`. `unitRefundWithTax` stays for display and is deprecated.
