---
'@tallyui/pos': minor
---

`useBarcodeScanner` takes `fieldPolicy: 'hold-money'`: as `'ignore-editable'`, except that a money field (an input with `inputmode="decimal"`) holds its keys until the run is known, so a scan never types into an amount and other runs go in at the caret as typing.
