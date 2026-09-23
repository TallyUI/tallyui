---
'@tallyui/core': minor
'@tallyui/connector-medusa': minor
---

Adds variant traits. `VariantSummary` (`id`, `title`, `sku`, `barcode`, `prices`, `stock`) and the optional `ProductTraits.getVariants` describe every purchasable variant of a product, and `findVariantByCode` finds a variant by barcode or SKU for scanning. The Medusa connector implements `getVariants`; its product-level `getPrices` and `getStock` results are unchanged.
