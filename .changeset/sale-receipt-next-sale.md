---
'@tallyui/pos': minor
---

On the receipt stage, `useSale`'s `add()` now starts the next sale (as `newSale()` does, on the default customer) and adds the entry to it, so a tap or scan after payment begins the next sale as in WCPOS v2; if the new sale is refused, `add()` returns that refusal and adds nothing. Every line and total change on the receipt (`setQuantity`, `addFee` and the rest of the line-lock set) is now refused with the new exported `SALE_FINISHED` ("This sale is finished. Start a new sale to change it.") instead of `SALE_HAS_PAYMENT`. `startTender()` (with or without a `tenderGate`, including a gate that answers after the sale completed) and `cancelTender()` now refuse on the receipt with `SALE_FINISHED`, so a finished sale can no longer be moved back to tender and completed a second time.
