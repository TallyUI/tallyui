---
'@tallyui/pos': minor
---

`useSale().updateLine(lineId, { name, sku, regularUnitPriceMinor })` edits a cart line; a line whose name or SKU differs no longer merges with a new scan of the same product, and an edited catalogue SKU goes to the store at order.create 12 when the server lists it.
