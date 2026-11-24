---
'@tallyui/pos': major
'@tallyui/components': patch
---

The sale rounds once in cash: a cash leg that settles after a void, or after a reopen with new lines, rounds the sale's unrounded remainder.
So the customer pays the one rounded total.

**Breaking signature change for outside callers:** `roundedDue` and `tenderRounding` take the sale's live rounding entries as a new last parameter; a caller that leaves it out rounds a sale that already has live entries a second time. `voidTender` now refuses to void a payment carrying a rounding entry while a later live cash payment carries one (`VOID_LATER_CASH_FIRST`; the pure rule is the new `cashVoidRefusal`).

In the components, Cancel and void now voids the taken payments latest first, and a void the core would refuse never reaches `beforeVoid`.
