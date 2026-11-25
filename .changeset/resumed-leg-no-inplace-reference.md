---
"@tallyui/pos": minor
"@tallyui/components": patch
---

`useSale` returns `tenderHeld(paymentId)`, true when `setTender` keeps that payment. The tender pane offers the in-place terminal reference only for a payment `setTender` would replace, so a captured card payment a resumed draft kept with no `takenAt` no longer gets the input, and typing in it no longer records the card payment a second time.
