---
"@tallyui/core": minor
"@tallyui/connector-woocommerce": minor
"@tallyui/pos": patch
---

`StoreOrder.needsPayment` (optional) says the store reports the order still owes money; WooCommerce reads it from `needs_payment`. Reports label a store order's unpaid remainder `unpaid` when it is true, and `unknown` when it is false or absent, as before.
