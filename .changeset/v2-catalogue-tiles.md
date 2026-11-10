---
'@tallyui/components': minor
'@tallyui/pos': minor
---

Add WCPOS v2's catalogue tile details: `InCartBadge` shows how many of a product the cart holds (summed by the new `cartQuantities` from `@tallyui/pos`), `CategoryTile` shows a category's photo full-bleed with an initial fallback, and `ProductFilterBar` brings v2's filter chips with In Stock on by default. `Catalogue` takes `cartLines` and `showFilterBar` to use them.
