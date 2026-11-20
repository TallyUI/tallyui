---
'@tallyui/connector-medusa': minor
---

Order history for Medusa (ADR-081): `createMedusaAdminUserConnector()` now has `listOrders`, `getOrders` and `orderFilters` (`status`, `customerId`, `dateRange`), read from the admin API (`GET /admin/orders`). Money is converted exactly from Medusa's major-unit amounts, and a refunded order reads as sold, with its refunds beside it. New exports: `createMedusaOrders`, `toMedusaStoreOrder`, `MEDUSA_ORDER_FILTERS`.
