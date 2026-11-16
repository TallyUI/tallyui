---
"@tallyui/core": minor
"@tallyui/connector-woocommerce": minor
---

`StoreSettings` gains `preventOverselling` and `StockLevel` gains `backorders` (`no` | `notify` | `yes`). The WooCommerce connector reads the store's `prevent_overselling` and each product's and variation's `backorders`, which WCPOS v2's stock guard needs. The product schema goes to version 3, so a till resyncs its products once.
