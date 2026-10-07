---
"@tallyui/pos": minor
---

The order layer carries coupon ids and regular prices (#501, ADR-077 step d3b). Nothing applies a coupon yet.
- `OrderCouponContext` requires `couponIds`, and each `Order.coupons` row names its `couponId`. `setCoupons` refuses a code with no id, and takes an optional new context, which replaces the builder's once every code passes its checks.
- A catalogue line keeps its regular unit price as `regularUnitPriceMinor`. The new `regularUnitPriceMinor(resolved)` helper picks it from `resolvePrice`'s result. A price edit or a restored draft keeps it, lines with different regular prices do not merge, and custom lines have none.
- Parked-sale drafts keep the order's coupons; restoring a draft does not apply them.
- `finalizeOrder` stores the order's coupons and each line's regular price in `pos_orders` version 9. An order without them is stored as before.
- Coupons that exclude sale items are still refused.
