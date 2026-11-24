---
'@tallyui/core': minor
'@tallyui/connector-woocommerce': minor
'@tallyui/pos': minor
---

A store sale now counts on its paid day. `ListOrdersQuery` gains an optional `modifiedAfter` filter (WooCommerce `modified_after`), and the WooCommerce connector lists it. The new `salesRangeQuery` builds a sales report's read: with `modifiedAfter` it fetches orders changed since the range start and created before its end. `reportOrderFromStoreOrder` places a store order on `paidAt`, or on `placedAt` when the order has none. So a WooCommerce order created in a report's range but paid after it now counts on its paid day, as in WCPOS v2.
