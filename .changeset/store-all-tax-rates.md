---
'@tallyui/core': minor
'@tallyui/connector-woocommerce': minor
---

`StoreSettings` gains an optional `allTaxRates`: every tax rate the store defines, with where it applies, for an app's "View all tax rates" table (`StoreTaxRate`, `StoreTaxRateLocation`). The WooCommerce connector fills it from the `/taxes` rates it already reads; the filtered `taxRates` and `taxRatesPpm` the cart uses are unchanged (#669).
