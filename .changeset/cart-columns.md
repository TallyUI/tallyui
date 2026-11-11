---
'@tallyui/pos': minor
'@tallyui/components': minor
---

`Cart` takes `columns`, v2's Cart Settings › Columns (#695): each of Qty, Image, Item, SKU, Price and Total has a `show` switch, `quantity.split` adds a Split link under a quantity above 1, and `name.sku` puts the SKU under the name. The defaults keep today's cart (Qty, Item, Price folding as before, Total). `CartColumnHeads` and `CartLine` take the same `columns`, and `CartLine` takes `sku`, `imageUrl` and `onSplit`; `cartColumnIds` gives the visible columns. `OrderBuilder.splitLine` and `useSale().splitLine` turn a line of quantity N into N lines of 1, refusing a line with a fixed discount (`SPLIT_FIXED_DISCOUNT`). `cartColumnIds` and `CartColumnSettings` are exported from the `@tallyui/components` root.
