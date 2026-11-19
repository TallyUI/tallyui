---
'@tallyui/components': minor
---

`ChargeForm` takes `allowPercent` (a currency-or-% unit toggle on fees) and `pricesIncludeTax` (an Amount Includes Tax switch on fees and shipping that starts at the store's tax mode, hidden on a percent fee, which is always of the cart in the store's mode), as WCPOS v2's Add Fee and Add Shipping do; `Cart` passes both and shows a percent fee's Price cell as its percent.
