---
'@tallyui/pos': minor
---

`useBarcodeScanner` takes an optional `fieldPolicy`. The default, `'reset'`, keeps today's rule (keys typed into an input or textarea are never scanned); `'ignore-editable'` also leaves keys typed into a select or a contentEditable element alone.
