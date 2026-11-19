---
'@tallyui/pos': minor
---

The wedge detector and `useBarcodeScanner` take an optional `gapRule`. The default, `'folded'`, keeps v2's folded average; `'every'` requires every gap in a burst to be under the threshold, so a slower key drops the burst and starts a new one.
