---
'@tallyui/core': minor
'@tallyui/connector-woocommerce': minor
---

Customers carry an optional `createdAt`, and the optional connector method `searchCustomersPage` returns a page of a customer search with the store's total (`CustomerPage`); the WooCommerce connector fills both, from `date_created_gmt` and the `X-WP-Total` header (#680).
