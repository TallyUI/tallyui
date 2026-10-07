---
"@tallyui/connector-vendure": minor
---

Order history for Vendure (ADR-079). `listVendureOrders(context, options)` reads the channel's placed orders, newest first and paged, through the Admin API. It filters on the server by placed date, state, register (`tallyRegisterId`), cashier (`tallyCashierRef`), customer, and a search on order code or customer last name. `getVendureOrder(context, id)` reads one order with its lines, totals, tax summary, payments and refunds. Both return Vendure's own fields unmapped, need `ReadOrder` (and `ReadCustomer` for the customer filter), and write nothing locally. Pass `tallyFields: false` on a server without the vendurepos plugin.
