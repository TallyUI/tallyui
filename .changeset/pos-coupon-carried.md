---
"@tallyui/pos": minor
---

A store-priced coupon can be carried (refused at send, charged at its price) and is sent as line discounts, never as a coupon. pos_orders goes to schema 19.
A carried sale parks and resumes with its figures, refuses coupon changes with COUPON_CARRIED, and refuses tender once edited with COUPON_CARRY_STALE.
`reopenRefusedOrder` carries a refused sale's coupons at the amounts charged, refuses with `coupon_carry_inexact` and `toCollectMinor` when it cannot, and takes `{ withoutCoupons: true }` as the explicit drop.
