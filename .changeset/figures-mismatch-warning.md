---
'@tallyui/core': minor
'@tallyui/components': patch
---

`CommandWarning` gains `{ code: 'figures_mismatch'; fields: Array<{ field: 'subtotalMinor' | 'taxMinor' | 'discountMinor' | (string & {}); tillMinor: number; serverMinor: number }> }` (#257): one warning per sale listing each of the till's figures that differs from the server's own computation. `parseCommandResult` accepts it when `fields` is non-empty, each `field` is one of the three names with none repeated, and each entry's two values are different safe integers. `knownWarnings` applies the same rules but keeps a field name it doesn't know (any non-empty string), since a newer store may send one; the orders list renders it, an unknown field by its raw name.
