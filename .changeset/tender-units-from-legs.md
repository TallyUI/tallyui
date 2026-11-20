---
'@tallyui/pos': minor
'@tallyui/components': patch
---

A payment leg records the units it paid for (`Payment.units`), and the tender pane rebuilds its unit allocations from the order's legs when it mounts again (#1133). `addTender` refuses units on a line that is not on the order, or more units than the line has unpaid.
