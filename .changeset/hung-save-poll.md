---
"@tallyui/pos": minor
---

A hung save — one whose order is built and whose save neither resolves nor throws — now re-asks `isStored` by itself every 5 s while it stays unconfirmed, so `useSale` sets `canContinue` and `Tender` can offer Continue with no user action. This covers an app whose tender has no New sale control while saving (medusapos), which never triggered the existing refused-`newSale()` check. The poll clears when the save settles, on confirmation, on `newSale()`/`continueSale()` and on unmount; at most one runs at a time. `SALE_SAVING` is now exported from `@tallyui/pos`.
