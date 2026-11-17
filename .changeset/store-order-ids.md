---
'@tallyui/core': minor
'@tallyui/connector-woocommerce': minor
---

A store order read now carries what a reopen needs to write the order back: the order's `revision`, an `id` on each fee, shipping line and payment record, and the recorded `taxStatus` on a fee or shipping line, a fee's `taxClass` and a shipping line's `methodId`. All new fields are optional. The WooCommerce connector fills them from the order resource and the WCPOS payment ledger.

An order list page now leaves out an order the connector cannot read and counts it in `unreadable`, instead of failing the whole page. An order whose payment record the connector cannot read carries `paymentRecordUnreadable`.
