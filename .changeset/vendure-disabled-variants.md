---
"@tallyui/connector-vendure": patch
---

A variant disabled in Vendure (`enabled: false`, replicated since #110) is no longer offered, priced or counted: `getVariants`, `getPrices`, `getPrice`, `getRegularPrice`, `getStock` and `getVariantCount` now consider live variants only, and `isSellable` also requires at least one when the product has variants at all. A product with none left is not sellable, so `addProduct` refuses it (#104).
