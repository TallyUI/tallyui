---
"@tallyui/pos": patch
---

`useStoreOrdersInRange` stops a read whose `hasMore` page adds no new order even when that page reports unreadable orders, and counts unreadable orders only from pages that add a new order, so a store repeating such a page no longer pages forever.
