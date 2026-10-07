---
"@tallyui/pos": minor
---

The sale applies coupons (#501, ADR-077 step d3c). No app passes a coupon source yet, so nothing changes for a cashier.
- `useSale` returns `applyCoupon(code)` and `removeCoupon(code)`. `applyCoupon` refuses with `COUPONS_UNSUPPORTED` ("This store's plugin does not support coupons yet") unless the store's capabilities say `coupons: true`, the app passes discount codes (`discountCodes`, see the d6 entry), and they support the store; WooCommerce's need its tax context.
- Each code is validated with `woocommerceCoupons.validateCoupon` before it is applied, and every refusal has its own cashier-facing sentence (`woocommerceDiscountCodes.couponRefusal`).
- Resuming a parked sale looks its coupons up and validates them again; any that no longer pass are removed, and the message says why.
- `useSale`'s settings may carry `calcDiscountsSequentially`. New export: `COUPONS_UNSUPPORTED`.
