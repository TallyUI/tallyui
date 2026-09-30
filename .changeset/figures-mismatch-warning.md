---
'@tallyui/core': minor
'@tallyui/components': patch
---

`CommandWarning` gains `{ code: 'figures_mismatch'; fields: Array<{ field: 'subtotalMinor' | 'taxMinor' | 'discountMinor'; tillMinor: number; serverMinor: number }> }` (#257): one warning per sale listing each of the till's figures that differs from the server's own computation. `knownWarnings` keeps it and `parseCommandResult` accepts it when `fields` is non-empty, no field is repeated and each entry's two values are different safe integers; the orders list renders it as one line.
