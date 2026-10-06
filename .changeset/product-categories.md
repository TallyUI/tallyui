---
"@tallyui/core": minor
"@tallyui/pos": minor
"@tallyui/connector-woocommerce": minor
"@tallyui/connector-medusa": minor
"@tallyui/connector-vendure": minor
"@tallyui/connector-shopify": minor
---

Products report flat categories with string ids through the new optional `getCategories` trait (WooCommerce and Medusa categories, Vendure collections, Shopify product type). `@tallyui/pos` adds `productCategories`, `listCategories` and `inCategory`, which fall back to `getCategoryNames` for connectors without the trait.
