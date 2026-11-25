---
'@tallyui/pos': patch
'@tallyui/connector-woocommerce': patch
---

On a tax-inclusive WooCommerce store, a sale with a till discount and a coupon could reach WooCommerce without the till discount when the coupon took off more tax than the discount, so the order total in WooCommerce was higher than the sale. The till now sends each line's discount net of its tax before the coupon, and the WooCommerce order always carries the line discount.
