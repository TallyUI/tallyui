---
"@tallyui/connector-vendure": patch
---

`@tallyui/connector-vendure` `listOrders` now refuses every filter field (`status`, `customerId`, `dateRange` and the rest) with `UnsupportedOrderFilterError`, as the `ListOrdersQuery` contract says, instead of dropping it and returning the whole store. Paging and `search` are unchanged.
