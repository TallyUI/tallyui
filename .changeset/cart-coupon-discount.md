---
"@tallyui/components": minor
---

`Cart` takes `couponDiscountMinor`, the coupon amount the app itemises under the Subtotal (`afterSubtotal`). When it is set, the totals' Discount row shows the other discounts only and is hidden when they come to 0, so a coupon is no longer counted twice. Without it, the Discount row is unchanged.
