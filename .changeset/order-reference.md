---
'@tallyui/components': patch
---

The receipt prints the finalized order's reference (its id's last 8 characters, plus the store's #number once synced) and time when given `posOrder`, and Orders shows the same reference, so a receipt matches its row. A receipt rendered without `posOrder` is marked '(draft)'. Apps pass useSale's receipt-stage `posOrder` to `<Receipt>`.
