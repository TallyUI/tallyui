---
'@tallyui/components': major
'@tallyui/core': minor
---

**Breaking:** the cart and checkout components are presentational and take `Money`. `CartLine` takes `name`, `quantity`, `unitPrice` and `lineTotal`. `CartTotal` takes `subtotal`, `taxLines`, `discount` and `total`. `CashTendered` and `ChangeDisplay` take `Money` amounts. All of them format with `formatMoney`, so there is no `getPrice`, float arithmetic or hard-coded `'$'`. `CartPanel` is generic, and `CartLineItem` is removed. Totals come from `@tallyui/pos`; the components no longer compute tax. The cash input keeps the text as typed and emits integer minor units.

`@tallyui/core` adds `moneyFromDecimalString`, which parses typed decimal text into `Money` using integer arithmetic.
