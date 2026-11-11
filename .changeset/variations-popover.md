---
'@tallyui/pos': minor
'@tallyui/components': minor
---

`Catalogue` takes `variationsStyle`, v2's Product settings › Variations (#719). The default `'list'` keeps the variant list chooser; `'popover'` opens a grid tile's popover for a product with option groups, where the cashier picks one value per group (values no variant allows are dimmed), sees the matched variant's stock, and presses "Add to Cart: {price}". A full match never adds on its own, and the popover closes after Add. A product without option groups, and the table view, keep the list chooser. Adds `VariationPicker` to `@tallyui/components`, and `variantFits`, `matchVariant`, `disabledOptions` and `OptionPicks` to `@tallyui/pos`.
