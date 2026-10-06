---
"@tallyui/core": patch
"@tallyui/connector-woocommerce": patch
---

A WooCommerce order can carry several payments when the store's plugin records the list
(`order_payments_list`): the primary tender names the payment method and `_woocommerce_pos_payments` keeps all of
them. `ServerCapabilities.multiplePayments` tells the app whether to offer split tender. The connector also reports `lineTax: { none: true, classes: true }` itself, since WCPOS has no `/tally/v1/info`.
