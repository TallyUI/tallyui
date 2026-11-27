---
'@tallyui/core': minor
'@tallyui/connector-woocommerce': minor
---

The WooCommerce connector can send a coupon-free tax-exempt sale to a stock, tax-exclusive WCPOS `1.10.N` (N ≥ 20) or `2.0.N` (N ≥ 5) store. Pass `ServerCapabilities.taxExempt` to the transport as `acceptsTaxExempt` to send `is_vat_exempt: 'yes'` order meta. `precheckCommand` now requires `taxExemptCoupons` as well as `taxExempt` for an exempt sale carrying coupons.
