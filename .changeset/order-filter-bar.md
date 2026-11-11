---
"@tallyui/pos": minor
"@tallyui/components": minor
---

Add `OrderFilterBar`, WCPOS v2's row of order filter pills (Status, Payment Method, Customer, Cashier, Store / Created via, Register, Date range) with Clear all. It is presentational: the app passes the value, the connector's `orderFilters` and every option list, and a pill shows only when its field is supported. pos adds `OrderFilterValue` and `orderFiltersQuery(value, timezone)`, which turns the bar's value into `ListOrdersQuery` filter fields, with the store-day range as UTC instants (`before` exclusive).
