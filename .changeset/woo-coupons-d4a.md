---
"@tallyui/connector-woocommerce": minor
---

The WooCommerce connector sends a coupon sale (#501, ADR-077 step d4a-woo).
- A store that lists `order_create_v5` and passes the coupons gate (plugin 1.9.0 or later, or a `coupons` capability) is advertised `orderCreate: 6`. `WOO_ORDER_CREATE_VERSION` is still 5.
- A version-6 envelope with coupons is pushed with `coupon_lines` (the codes, in the order applied), and each line carries its POS price and regular price in `_woocommerce_pos_data`, so WooCommerce applies the coupons to the till's prices.
- A store's coupon refusal (`woocommerce_rest_invalid_coupon`) is rejected as `coupon_invalid`, never retried, with the store's message as plain text, `storeCode`, and `couponCode` when the message names a coupon of the sale.
- A store total that differs after the order is created stays `applied`, with the store order's refs and the `total_mismatch` warning (ADR-077's R4 exception).
- An envelope without coupons is pushed exactly as before.
