---
'@tallyui/core': minor
'@tallyui/connector-woocommerce': minor
'@tallyui/components': minor
---

Catalogue shows the Featured chip only for connectors implementing the new optional `getFeatured` product trait. WooCommerce implements it with product schema version 5, so a till resyncs its products once.
