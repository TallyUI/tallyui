---
"@tallyui/pos": patch
---

Only a cash method rounds its due (roundedDue, tenderRounding, tenderFigures); a non-cash method with a rounding increment keeps the exact due, as the leg it takes does.
