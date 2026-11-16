---
'@tallyui/core': minor
'@tallyui/pos': patch
'@tallyui/components': minor
---

`@tallyui/core` adds `MoneyFormatProvider`, `useFormatMoney` and `useCurrencySymbol`. `@tallyui/pos`'s `CurrencyProvider` renders the provider, and every `@tallyui/components` money amount and money-input symbol now reads the store's money format when one is provided. Without a provider, nothing changes. `discountLabel` takes an optional formatter as its third argument.
