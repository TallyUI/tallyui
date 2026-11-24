---
'@tallyui/pos': patch
'@tallyui/components': patch
---

With a payment in progress, a cash leg that is not a whole number of cash steps is refused with `CASH_WAITS_FOR_PAYMENT` (ADR-094), instead of recording an amount no coins can make; the tender pane disables Take with the same message.
