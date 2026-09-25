---
"@tallyui/pos": patch
---

Resuming a parked order now keeps each line's own tax mode (`taxInclusive`) instead of falling back to the store's mode. Previously a parked mixed cart came back with every line priced in the store's mode, changing both the settlement figures (`subtotalMinor`, `discountMinor`, `taxMinor`, `totalMinor`) and the display figures from the ones the cashier parked.
