---
"@tallyui/connector-woocommerce": minor
"@tallyui/core": minor
---

`ServerCapabilities` gains an optional `coupons` (#501, ADR-077 ruling R3). Absent means the store does not accept an order's coupons. The WooCommerce connector's `readWooCapabilities` now also reads `GET wcpos/v2/site`. `coupons` is true only when its `wcpos_version` is woocommerce-pos 1.9.0 or later; every unclear or failed read gives false. `orderCreate` is decided as before. Nothing reads `coupons` yet.
