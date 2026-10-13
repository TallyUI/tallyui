---
"@tallyui/pos": minor
---

The order layer carries coupon ids and regular prices (#501, ADR-077 step d3b). Nothing applies a coupon yet.
- **Breaking** change for code that builds an `OrderCouponContext` or reads `Order.coupons` as shipped in 3.9.0: `couponIds` is now required and each `Order.coupons` row has a required `couponId`. `setCoupons` refuses a code whose id is missing or empty, and takes an optional new context, which replaces the builder's once every code passes its checks. No consumer outside `@tallyui/pos` builds the context. This remains a minor release because TallyUI is pre-beta.
- A catalogue line keeps its regular unit price as `regularUnitPriceMinor`. The order builder picks the regular price from `resolvePrice`'s result. A price edit or a restored draft keeps it, lines with different regular prices do not merge, and custom lines have none.
- Parked-sale drafts keep the order's coupons; restoring a draft does not apply them.
- `finalizeOrder` stores the order's coupons and each line's regular price in `pos_orders` version 9. An order without them is stored as before.
- Coupons that exclude sale items are still refused.
