---
'@tallyui/core': minor
'@tallyui/pos': minor
'@tallyui/components': minor
---

A store can report the lines whose figures it computed differently with the new `line_figures_mismatch` warning, which `parseCommandResult` and `knownWarnings` accept. `moneyDivergence(order)` gives a sale's differing order figures and line ids, and the orders list counts the differing lines.
