---
"@tallyui/pos": patch
---

Stacked line discounts now record what each one actually removed, capped at what the earlier discounts on the same line left, instead of the discount's raw computed amount. A line's `discountMinor` is unchanged; only the per-discount `amountMinor` breakdown the receipt will print is corrected (#63).
