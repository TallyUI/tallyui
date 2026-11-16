---
'@tallyui/pos': minor
---

order.create version 9 (#790, ADR-088): the order builder splits each store-priced coupon over its lines, `finalizeOrder` stores the split (`PosOrderCoupon.lines`, `PosOrderCouponLine`), and the till sends it as `coupons[].lines` when the server advertises 9. Below 9 every payload is byte for byte as before. `pos_orders` goes to schema version 13 (identity migration, one-way) and `ORDER_CREATE_MAX_VERSION` is 9.
