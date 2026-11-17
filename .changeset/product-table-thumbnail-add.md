---
'@tallyui/components': minor
---

`ProductTable` takes `showThumbnail` and `showAddButton`, and `Catalogue` takes `tableRow: { thumbnail, addButton }` for its table view, drawing WCPOS v2's product table row: the product's thumbnail leads the row (40 px, 56 px under a coarse pointer, an initial tile when there is no image) and a `+` labelled "Add to cart" ends it, or a `>` labelled "Variations" for a product with more than one variant. The button calls `onSelect` exactly as a row press does, once. Both default off. `PlusIcon` and `ChevronRightIcon` are new exports.
