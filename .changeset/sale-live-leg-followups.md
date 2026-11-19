---
'@tallyui/pos': patch
---

`useSale` no longer moves a sale's total through its store-priced coupons while a till payment is captured or in motion: stale coupon prices are not priced again automatically then, and `repriceCoupons()` refuses with the same refusal as the other line and total changes (`SALE_HAS_PAYMENT`, `SALE_FINISHED` on the receipt, or `SALE_SAVING`). The coupons stay stale, so `startTender()` and `complete()` keep refusing with `COUPONS_REPRICING` until the payment is cancelled; then they are priced again. On the receipt, `voidTender()` and `removeTender()` now refuse with `SALE_FINISHED` and leave the finished sale's payments as they are. `SALE_HAS_PAYMENT` now reads "A payment was taken on this sale. Cancel the payment before changing the sale.", after the Cancel payment button, and `setTenderStatus(id, 'failed')` clears it once no payment is live.
