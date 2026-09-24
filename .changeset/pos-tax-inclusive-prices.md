---
'@tallyui/core': patch
'@tallyui/pos': minor
'@tallyui/connector-medusa': patch
---

`resolvePrice` keeps a price's `taxInclusive` flag on `current` and `was`. Each order-builder line keeps its price's own tax mode (`LineItem.taxInclusive`, plus `priceTaxModeConverted` when it differs from the store's `pricesIncludeTax`), so a customer pays exactly the shelf price and an inclusive price in an exclusive store is no longer taxed twice. Orders whose prices carry no flag, or one that agrees with the store, total exactly as before. The receipt shows a converted line in the order's mode, by its share of the order's once-rounded tax, so the lines still add up.

In priced mode, the Medusa traits' deprecated `getPrice` and `getRegularPrice` return the resolved calculated price instead of the admin prices, and `isSellable` is false when no variant yields a price (for example a `calculated_price` with null amounts).
