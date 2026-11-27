---
'@tallyui/connector-woocommerce': minor
---

The WooCommerce command transport reads `/site` for coupon sales, `/status` and `/site` for cash rounding, and `/status` for split tender. The `acceptsCoupons`, `acceptsCashRounding` and `acceptsPaymentsList` options are deprecated: `false` still closes the corresponding gate, but `true` no longer opens it without store support.
