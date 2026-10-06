---
'@tallyui/connector-woocommerce': patch
---

The WooCommerce transport maps order.create version 5: fees as `fee_lines`, shipping as `shipping_lines` and custom lines as a WCPOS misc product (`product_id` 0 with `_woocommerce_pos_data`), and the connector now reports `orderCreate: 5`.
