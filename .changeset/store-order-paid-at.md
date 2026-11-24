---
'@tallyui/core': minor
'@tallyui/connector-woocommerce': minor
---

`StoreOrder` gains an optional `paidAt`: when the store recorded the order as paid, as an ISO 8601 UTC instant. It is absent while the order is unpaid, or when the store records no paid date. The WooCommerce connector reads it from `date_paid_gmt` and never falls back to the site-local `date_paid`. A value that does not parse leaves no `paidAt`.
