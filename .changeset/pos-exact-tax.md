---
'@tallyui/pos': minor
---

Adds an exact, integer-only tax API: `ratePpmFromPercent`, `taxMicros`, `roundMicrosToMinor` and `computeOrderTax`. Line tax is kept exactly in micro-minor-units (as a `bigint`) and rounded once, half away from zero, at the order total. This matches Medusa, which keeps line tax unrounded and rounds only at payment. The existing float tax functions are unchanged for now.
