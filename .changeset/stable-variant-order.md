---
"@tallyui/core": minor
"@tallyui/connector-medusa": minor
"@tallyui/connector-vendure": minor
---

Both connectors now store a product's variants sorted by id, since neither Medusa nor Vendure guarantees variant order across requests: `@tallyui/core` adds `compareIds`, and the Medusa and Vendure product projections (`toDocument`, `toProductDocument`) sort `variants` with it before the document is stored. Traits that read `variants[0]` (`getPrices`, `getSku`, `getPrice`, `getStockQuantity`, `getBarcode` and others) now see a stable variant across runs.

Already-stored documents take the new order the next time they are delivered. Vendure's variant feed re-delivers every product on its first pass anyway, so it heals immediately.
