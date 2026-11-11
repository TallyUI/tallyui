---
'@tallyui/components': minor
---

An empty `Cart` now shows v2's empty state: a centred cart icon over one line, and no column heads, totals, Cash and Card terminal row or Checkout foot. A sale error on an empty cart shows under the line. The default line changed from "Scan or tap a product to start a sale." to v2's "Tap a product to start a sale"; `emptyText` and `emptyIcon` (`null` for none) replace them. A cart with only a fee or shipping row keeps its heads and foot and shows no empty line. Adds `ShoppingCartIcon`.
