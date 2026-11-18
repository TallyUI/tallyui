---
'@tallyui/components': minor
---

DiscountForm: `layout="dialog"` gains v2's Quick discount / Coupon tabs when `onApplyCoupon` is passed. The Coupon tab picks one of the app's `coupons` (the new `DiscountCoupon` type) from a searchable list and applies it; a refusal shows inline and the dialog stays open. Without `onApplyCoupon` the dialog renders as before.
