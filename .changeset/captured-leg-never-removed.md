---
"@tallyui/pos": minor
"@tallyui/components": patch
---

A taken tender leg is kept until voided: `setTender`, `startTender` and Back keep it, `removeTender` refuses it with `PAYMENT_TAKEN`, and `newSale` refuses an unfinished sale holding one. New `cashToReturn` lists the cash to give back. The tender pane voids a till leg the store refuses instead of removing it.
