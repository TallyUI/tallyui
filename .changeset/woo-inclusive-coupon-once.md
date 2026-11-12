---
'@tallyui/connector-woocommerce': patch
---

On a tax-inclusive store, a line with a coupon now posts its net before the coupon, so WooCommerce applies the coupon once and stores the total the till charged (it applied it twice: FIVEOFF stored 7.25 against 12.25 charged).
