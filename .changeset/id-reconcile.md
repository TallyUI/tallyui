---
"@tallyui/core": minor
"@tallyui/database": minor
"@tallyui/connector-vendure": minor
---

Add the id reconcile (ADR-060): a periodic pass that reads every live product id and its live variant ids, so a deleted product or a deleted variant (whose parent's `updatedAt` does not change) reaches the local copy. `@tallyui/core` adds the `IdReconcileAdapter` contract and `createReconcileFeed`, which turns queued corrections into a pull-only adapter meant as the last key of `combinePullAdapters`. `@tallyui/database` adds the `startIdReconcile` runner. `@tallyui/connector-vendure` implements the Vendure side and wires it into `replication.products` and `reconcile.ids`. Nothing is written locally into the replicated collection; corrections arrive only through the collection's own pull.
