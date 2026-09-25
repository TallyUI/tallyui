---
"@tallyui/pos": minor
---

`ReceiptData.totals` now comes from `order.display` (ADR-063), not the settlement fields: `subtotalMinor` is before discounts and `discountMinor` is every discount, both in the store's display mode, and a new `taxInclusive` flag says whether the tax is added or already included. `taxMinor` and `totalMinor` are unchanged in value. This is a behaviour change for anything that reads `ReceiptData.totals`: the receipt's invariant is now `Σ lineTotalMinor === totals.subtotalMinor − totals.discountMinor`, plus `+ totals.taxMinor === totals.totalMinor` when exclusive, or `=== totals.totalMinor` when inclusive. Receipt lines and each line's own discount row are unchanged, still in the line's own mode.
