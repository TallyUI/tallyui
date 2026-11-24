---
"@tallyui/core": minor
"@tallyui/connector-woocommerce": minor
"@tallyui/pos": patch
---

`StoreOrder.needsPayment` (optional) says the store reports the order still owes money; WooCommerce reads it from `needs_payment`. Reports label a store order's unpaid remainder `unpaid` when it is true, so Taken no longer counts it; when the flag is false or absent the remainder stays `unknown` and counts toward Taken, as before.
