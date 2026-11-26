---
'@tallyui/pos': patch
---

`needsAttention` no longer lists a sale for a `total_mismatch` whose rounding bridge is within ADR-048's tolerance: |`bridgeMinor`| at most ⌈(lines + fees + shipping) / 2⌉ minor units, counted once for the whole order. The row still shows the rounding notice in Recent. A larger bridge, a `total_mismatch` without a bridge, and every other warning still list the sale.
