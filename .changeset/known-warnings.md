---
'@tallyui/core': minor
'@tallyui/pos': patch
'@tallyui/components': patch
---

`CommandWarning` gains `bridgeMinor` on `total_mismatch` and a new `tax_rate_mismatch` code, and the till now ignores warning codes it doesn't know (`knownWarnings`), instead of showing them as a store total.
