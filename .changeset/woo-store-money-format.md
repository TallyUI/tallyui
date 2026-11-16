---
'@tallyui/core': minor
'@tallyui/connector-woocommerce': minor
---

`StoreSettings.moneyFormat` carries the store's own money format (core's `MoneyFormat`). The WooCommerce connector fills it from WCPOS's store row (currency position, thousand and decimal separators, decimals) and WooCommerce's currency symbol, so CAD reads `$`; pass it to `CurrencyProvider`'s `format`.
