---
'@tallyui/core': minor
'@tallyui/pos': patch
---

`minorToMajor` is exported from the `@tallyui/core` root and `minorUnitDigits` from `@tallyui/core/server`, so each money converter has one name everywhere. `currencyDecimals`, `moneyToMajor` and `@tallyui/pos`'s `minorToDecimal` are deprecated in their favour; nothing is removed.
