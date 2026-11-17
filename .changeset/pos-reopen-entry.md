---
'@tallyui/pos': minor
---

New `reopenStoreOrder` reopens a store order from the detail read the cashier opened. It refuses the order before anything is sent when:
- its status is cancelled, failed or trash;
- a product is gone from the till's catalogue;
- it has been paid more than its total;
- any W2 rebuild check fails.

Otherwise it sends `order.reopen` with that read's revision, reads the order again and builds the cart from the new read.

New `useSale().openStoreOrder` loads the result into an empty sale. Locked store payments no longer stop `closeSale` or `switchSale`.

`isReopenOffered` now also needs `orderCreate` 5 or more. A parked reopened order keeps the store's prices when it is resumed.
