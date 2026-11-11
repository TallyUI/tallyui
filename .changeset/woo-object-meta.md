---
'@tallyui/connector-woocommerce': patch
---

Variable products from WCPOS 1.10.20 and later no longer fail validation in dev builds: a product's stored `meta_data` now keeps only the entries with string values, so object meta such as `_woocommerce_pos_variable_prices` is dropped (#713).
