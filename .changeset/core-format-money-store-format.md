---
'@tallyui/core': minor
'@tallyui/pos': patch
---

`formatMoney(money, locale, format)` takes an optional store money format (`MoneyFormat`: currency position, thousand and decimal separators, decimals, symbol), as WooCommerce stores set them; without one it reads exactly as before, through Intl. `@tallyui/pos`'s `CurrencyProvider` now formats through it, and its `CurrencyFormat` type is `MoneyFormat`.
