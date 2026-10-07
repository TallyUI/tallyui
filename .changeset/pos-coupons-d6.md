---
"@tallyui/pos": minor
---

The sale takes the platform's discount codes (ADR-077 amendment 3). Each platform keeps its own discount model, so `useSale`'s `discountCodes` option takes a `SaleDiscountCodes` contract. The contract has five parts: `supports`, `find`, `check`, `apply`, and an optional `beforeResume`. A refusal is shown to the cashier in the platform's own words. WooCommerce coupons are one implementation: `woocommerceDiscountCodes.createDiscountCodes(source)`. `createSaleCouponSource`, `startCouponUsageRefetch`, `couponRefusal` and the `SaleCoupon` and `SaleCouponSource` types are exported under `woocommerceDiscountCodes`, not at the top level. A cashier sees no change.
