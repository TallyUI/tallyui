---
'@tallyui/pos': minor
'@tallyui/connector-woocommerce': patch
---

Orders with fees, shipping or custom lines can be completed and sent as `order.create` version 5 to a store that
accepts it (others refuse at completion, naming the plugin upgrade). `pos_orders` moves to version 8, which also
records the woocommerce tax rounding (ADR-075, ADR-076). **Version 8 is one-way: a till that opens this release
can't go back.**
