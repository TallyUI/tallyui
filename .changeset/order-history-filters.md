---
'@tallyui/core': minor
---

`ListOrdersQuery` takes v2's order-history filters (#721): `status`, `customerId`, `cashierId`, `registerId`, `paymentMethod`, `storeId`, `createdVia` and `dateRange` (`after` and `before` as ISO 8601 UTC instants ending in `Z`). A connector lists the fields its `listOrders` honours in the new optional `TallyConnector.orderFilters` and maps each its own way; any other set field is refused with `UnsupportedOrderFilterError` (`code: 'unsupported_order_filter'`, `fields`), which `assertOrderFiltersSupported` gives. Also exports `OrderFilterField`, `ORDER_FILTER_FIELDS`, `orderFilterFields` and `assertOrderDateRange`.
