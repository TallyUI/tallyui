---
'@tallyui/connector-woocommerce': minor
---

`listOrders` now filters order history on the server. The connector declares `orderFilters` (`status`, `customerId`, `cashierId`, `storeId`, `createdVia`, `dateRange`, also exported as `WOO_ORDER_FILTERS`) and sends them to WCPOS `wcpos/v2/orders` as `status`, `customer`, `pos_cashier`, `pos_store`, `created_via` and `after`/`before`, with `dates_are_gmt=true` and the bounds converted to WooCommerce's strict whole-second comparison. `registerId` and `paymentMethod`, which WCPOS does not filter on, are refused with `UnsupportedOrderFilterError` before any request instead of being dropped, and an id that is not all digits, or an empty `status` or `createdVia`, resolves an empty page without a request.
