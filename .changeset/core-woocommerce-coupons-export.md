---
"@tallyui/core": minor
---

`@tallyui/core` exports the WooCommerce coupon engine as `woocommerceCoupons` (#501, ADR-077 phase b), next to `woocommerceTax`. It has `recalculateCoupons`, `validateCoupon`, `toCouponConfigs` and `enrichCategoriesWithAncestors`, with their input, result and rejection types. Nothing in TallyUI calls it yet; the sale builder will in phase (d).
