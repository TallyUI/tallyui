---
'@tallyui/pos': minor
---

**Breaking (pre-1.0):** the order model now uses integer minor units throughout. `Order`, `LineItem`, `Payment`, discounts and `ReceiptData` money fields carry a `Minor` suffix (`totalMinor`, `unitPriceMinor`, `amountMinor`, ...). Tax is exact and rounded once per order (the `tax/exact` API). Lines carry stacked `taxLines`. The receipt's per-rate tax lines always sum to the charged tax (largest remainder). `addProduct` prices from `getPrices` and `resolvePrice` rather than the deprecated `getPrice`. The new `addLine` adds a specific variant at a given price with optional tax rates. Parked orders resume through `addLine`, with no synthetic traits.
