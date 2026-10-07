---
"@tallyui/pos": minor
"@tallyui/core": minor
"@tallyui/connector-woocommerce": minor
---

The order builder can apply WooCommerce coupons (#501, ADR-077 step d1). `createOrderBuilder` takes an optional `couponContext` (the coupon configs, product categories and the store's sequential-discount setting), and `setCoupons(codes)` replays the codes through the ported engine on a WooCommerce tax context. The order then carries `coupons` (`{ code, discountMinor, discountTaxMinor }`), its lines and totals are the post-coupon figures, and `display.coupons` shows one row per coupon while the display lines keep their pre-coupon amounts. Codes are trimmed, lower-cased and deduplicated. An unknown code, or one that excludes sale items, throws a `RangeError`. Other tax contexts ignore the codes. Drafts do not save coupons yet (step d3), and `useSale` does not expose them yet (step d3). `@tallyui/core` also exports `woocommerceCoupons.calculateOrderTotals` and `StoreSettings.calcDiscountsSequentially`, which the WooCommerce connector now reads from the store's settings.
