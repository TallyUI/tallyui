---
'@tallyui/core': minor
'@tallyui/connector-woocommerce': minor
'@tallyui/components': minor
---

Catalogue now applies the Featured chip itself, as it does In Stock and On Sale, and draws it only for connectors that implement the new optional `getFeatured` product trait. WooCommerce implements it with product schema version 5, so a till resyncs its products once.
