---
"@tallyui/core": minor
"@tallyui/database": minor
"@tallyui/connector-vendure": minor
"@tallyui/connector-medusa": minor
---

Add a stock reconcile pass (ADR-060). `@tallyui/core` adds the `StockReconcileAdapter` contract and an optional `reconcile.stock` on `TallyConnector`. `@tallyui/database` adds `startStockReconcile`, which re-reads stock every 5 minutes (and on demand through `reconcileStock()`) and patches only the local product documents whose stock differs; a failed or truncated read patches nothing. The Vendure connector reconciles variant `stockLevels`, and the Medusa connector reconciles inventory item location levels, so stock changes that bump no product timestamp reach the POS.
