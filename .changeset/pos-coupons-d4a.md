---
"@tallyui/core": minor
"@tallyui/pos": minor
---

A coupon sale is sent as `order.create` version 6 (#501, ADR-077 step d4a). No app passes a coupon source yet, so nothing changes for a cashier.
- Version 6 is version 5 plus the order's `coupons` (`code`, `couponId`, `discountMinor`, `discountTaxMinor`), each line's `regularUnitPriceMinor` and `attributes` when stored, and the receipt's `display.coupons`. `precheckCommand` accepts it, refuses those fields below version 6, and checks that each receipt coupon row names a coupon in the payload, once.
- `CommandRejectionCode` gains `coupon_invalid` (with `OrderCreateCouponInvalidData`: `storeCode`, `couponCode`) and `total_mismatch` (with `OrderCreateTotalMismatchData`).
- Only a coupon sale goes as 6. A sale without coupons is sent as before, byte for byte, whatever the store advertises.
- A coupon sale never goes below 6: `useSale` offers coupons only when the store also accepts version 6, `finalizeOrder` refuses a coupon sale to a store below 6, and the outbox keeps a coupon sale at 6 after an `unsupported_version` answer, so an older store refuses it instead of receiving it without its coupons.
- `ORDER_CREATE_MAX_VERSION` is 6, and a test pins it to `pos_orders`' `sentVersion` and `downgradedFrom` maxima.
