---
'@tallyui/core': minor
'@tallyui/connector-woocommerce': minor
---

The WooCommerce connector can send a coupon-free tax-exempt sale to a stock, tax-exclusive WCPOS `1.10.N` (N ≥ 20) or `2.0.N` (N ≥ 5) store. The transport reads `/status` and `/site` and sends `is_vat_exempt: 'yes'` exactly when the store declares `taxExempt`, using the same gate with no option to wire. A failed read retries the batch (after sign-in if unauthorized); it never refuses the sale. `precheckCommand` now requires `taxExemptCoupons` as well as `taxExempt` for an exempt sale carrying coupons.
