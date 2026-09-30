---
"@tallyui/pos": minor
---

The till sends `order.create` version 4 (#286) to a server that advertises 4. Each order is resent at the version it first went out at: the outbox records `sentVersion` before an order's first send, so a retry after the store upgrades is byte-identical. With the server's max unknown, the till sends at most 3 and records that. `requeue()` clears `sentVersion` and `downgradedFrom`, since the new `commandId` chooses afresh.

`pos_orders` moves to schema version 5: `sentVersion` and `downgradedFrom` accept 1 to 4, and the migration records each order without a `sentVersion` at its content version (3 with `display` and `taxByRate`, else 2 when discounted, else 1). Like version 4, this storage is one-way: an older build opens it but shows no orders (ADR-069).
