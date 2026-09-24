---
"@tallyui/core": minor
"@tallyui/components": minor
---

`@tallyui/core` adds `resolvePriceRange(variants, currency?)`, the lowest and
highest current price across a product's variants. `ProductPrice` uses it to
show `from <lowest price>` when a product's variants are priced differently,
instead of just the default variant's price. New `showFromPrice` (default
`true`) and `fromLabel` (default `'from'`) props control and opt out of this.
