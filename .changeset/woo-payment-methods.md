---
'@tallyui/connector-woocommerce': minor
---

The WooCommerce connector's `paymentMethods` lists the store's POS-enabled payment gateways from WCPOS's `wcpos/v2/payment-methods` route, with money limits and cash rounding in minor units, and falls back to cash and the card terminal on a plugin older than 2.0.0 (#679).
