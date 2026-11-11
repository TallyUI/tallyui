---
'@tallyui/pos': minor
'@tallyui/core': minor
---

`OrderBuilder.setCoupons` takes a store-priced coupon context (`StorePricedCouponContext`): the store's per-line amounts come off the lines in any rounding mode, `Order.coupons` and `display.coupons` carry each code's share of the settlement totals, and `couponPricesStale` flags an order changed since the store priced it, which `finalizeOrder` refuses; `couponPricingBasis` gives what the prices depend on. `parseInfoCapabilities` reads `coupons: true` from `/tally/v1/info` (#709).
