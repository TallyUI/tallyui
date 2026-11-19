---
'@tallyui/connector-woocommerce': patch
'@tallyui/connector-medusa': patch
'@tallyui/connector-vendure': patch
---

Internal tidy: the WooCommerce order, customer and order-push code use `WCPOS_UUID_META_KEY` instead of spelling the meta key, and stale doc comments are corrected (the Woo coupon order.create version, Medusa's ignored `maxPages` advice, the errors Vendure's `gql` throws). Behaviour unchanged.
