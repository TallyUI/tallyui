---
"@tallyui/pos": minor
"@tallyui/components": patch
---

Each sale records the tax rounding its figures were computed with (#287): `finalizeOrder` writes `taxRounding` on the stored order, the default (`per_order`, `half_away_from_zero`) included, and `custom` as `{ granularity: 'custom' }`. It is the till's own record and is never sent in `order.create`. The Z report splits each sale's tax by rate with the strategy that sale recorded, so its rows are the receipts' rows, and its `breakdowns.tax_rounding_mixed` is `true` when a session's sales used more than one strategy; `ClosureSheet` then says so.

`pos_orders` moves to schema version 6: `taxRounding` is required, and the migration records the default on every older sale, the only rounding any earlier build used. Like version 5, this storage is one-way: an older build opens it but shows no orders, so never roll an app back across it (ADR-069). Before 3.0.0 ships, #242's OPFS upgrade proof is rerun against version 6.
