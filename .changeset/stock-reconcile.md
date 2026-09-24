---
"@tallyui/core": minor
"@tallyui/database": minor
"@tallyui/pos": minor
"@tallyui/connector-vendure": minor
"@tallyui/connector-medusa": minor
---

Add a stock reconcile pass (ADR-060). `@tallyui/core` adds the `StockReconcileAdapter` contract (`fetchPages` and a pure `overlay`) and an optional `reconcile.stock` on `TallyConnector`. `@tallyui/database` adds the local-only `stock_levels` collection (`STOCK_LEVELS_COLLECTION`, `stockLevelsSchema`), which `createTallyDatabase` creates for connectors with `reconcile.stock`, and `startStockReconcile`, which re-reads stock every 5 minutes (and on demand through `reconcileStock()`) into that collection: it writes only changed rows, removes keys the backend no longer returns, writes nothing after a failed, truncated or stopped read, and never writes the replicated products. `@tallyui/pos` adds `stockOverlay$`, `withStockOverlay` and `getProductStock`, which read stock from the overlay where it has an entry and from the replicated product otherwise. The Vendure connector reconciles variant `stockLevels`, and the Medusa connector reconciles inventory item location levels, so stock changes that bump no product timestamp reach the POS.
