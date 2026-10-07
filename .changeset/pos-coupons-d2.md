---
"@tallyui/pos": minor
---

`pos_orders` is now schema version 9 (#501, ADR-077 step d2). Version 9 declares four optional fields, and nothing writes them yet:
- the order's `coupons` (`{ code, couponId, discountMinor, discountTaxMinor }`, exported as `PosOrderCoupon`);
- the receipt's `display.coupons`;
- a line's `attributes` (#495);
- a line's `regularUnitPriceMinor`.

It also lets an order's `sentVersion` and `downgradedFrom` be 6, ready for order.create version 6 (ADR-077 d4).

It also declares an order's optional `reopenedAt`, for a refused sale the till reopens as a parked sale (ADR-077 d4b).

The migration from version 8 is the identity, so every stored order is kept byte for byte. This is a one-way storage change (ADR-069). A till that goes back to a build on version 8 shows no orders and sends none of its pending ones until it is upgraded again. Nothing is deleted.
