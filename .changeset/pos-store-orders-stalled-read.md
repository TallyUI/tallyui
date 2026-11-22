---
'@tallyui/pos': patch
---

`useStoreOrdersInRange` ends a read with an error when a page says there is more but adds no new order and no unreadable one, so a store that keeps repeating a page stops, unless that page reports unreadable orders.
