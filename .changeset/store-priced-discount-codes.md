---
'@tallyui/pos': minor
---

`createStorePricedDiscountCodes({ supports?, price })` gives `useSale` discount codes for a store that prices its own codes, Medusa promotions first. When the order's store-priced coupon prices go stale, `useSale` prices its accepted codes again (`couponsRepricing`, `repriceCoupons()` for Retry), and `startTender` and `complete()` refuse with `COUPONS_REPRICING` until it has. `find` may now return a `transient` refusal, such as `COUPONS_NEED_CONNECTION`.
