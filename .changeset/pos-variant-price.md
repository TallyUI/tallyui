---
'@tallyui/pos': patch
---

addProduct charges the chosen variant's price (and SKU) instead of the first variant's; an unknown variant id throws. requeue() re-checks each order's status inside the write, so it never re-pends an order that is no longer rejected.
