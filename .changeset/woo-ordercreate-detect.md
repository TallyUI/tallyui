---
"@tallyui/connector-woocommerce": patch
---

`readWooCapabilities` reports `orderCreate: 5` only for a store that proves it takes version 5: `/wcpos/v2/status` lists `order_create_v5` or `order_payments_list`, or `/wcpos/v2/site` reports WCPOS 1.10.20 or later (the oldest release with a proven v5 push). Any other store, including one whose version cannot be read, gets `orderCreate: 3`, so fees, shipping and custom lines are not offered there.
