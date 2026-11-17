---
'@tallyui/connector-woocommerce': patch
---

Fix: a WooCommerce order read reports the payments the order actually holds. These are the captured rows of the WCPOS payment ledger, or, for an order without one, a single payment of the total only when the order is paid. An unpaid order no longer reads as fully paid.
