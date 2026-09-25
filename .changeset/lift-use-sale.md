---
"@tallyui/pos": minor
---

`@tallyui/pos` gains `useSale`, `addEntryToCart`/`CartError` and `catalogueEntries`/`findEntryByCode`/`variantPriceLabel` (ADR-052, TV5), lifted from medusapos/app `a1b981d`'s `use-sale`, `lib/cart` and `lib/catalogue` with the same behaviour. `useSale` takes an optional `session`, and stamps a completed sale with `stampSession` before `onSaleCompleted`; without it, behaviour is unchanged.
