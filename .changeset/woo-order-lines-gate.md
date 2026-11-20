---
'@tallyui/connector-woocommerce': minor
---

Stock WCPOS 1.10.20+ stores with no capability flags take order.create 7 (fees, shipping, custom lines, coupons, notes); a `none` shipping line carries its tax status to the store.
