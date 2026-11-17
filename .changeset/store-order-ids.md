---
'@tallyui/core': minor
'@tallyui/connector-woocommerce': minor
---

A store order read now carries what a reopen needs to write the order back: the order's `revision`, an `id` on each fee, shipping line and payment record, and a fee's recorded `taxStatus` and `taxClass` and a shipping line's `methodId`. All new fields are optional. The WooCommerce connector fills them from the order resource and the WCPOS payment ledger.
