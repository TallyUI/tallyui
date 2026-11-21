---
'@tallyui/pos': patch
---

`useStoreOrdersInRange` ends a read with an error when a page says there is more but adds no new order, so a store that repeats itself cannot page forever.
