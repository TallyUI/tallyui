---
"@tallyui/components": minor
"@tallyui/pos": minor
---

`ProductGrid` hides products this channel doesn't sell (`traits.isSellable`
false, for example a Medusa product outside the sales channel) unless
`showUnsellable` is set, and `ProductCard` shows such a product in a muted
"Not sold here" state instead of its price. `OrderBuilder.addProduct` now
refuses an unsellable product before looking up its price, instead of
throwing the unrelated "No price in …" error.
