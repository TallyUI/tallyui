---
"@tallyui/connector-woocommerce": patch
"@tallyui/core": patch
"@tallyui/pos": patch
---

Woo products carry `tax_class` and `tax_status` (schema version 2: a till resyncs its products once) through the `getTaxClass`/`getTaxStatus` traits. Core adds the optional `getTaxStatus` trait, which the cart and `addProduct` pass to the line.
