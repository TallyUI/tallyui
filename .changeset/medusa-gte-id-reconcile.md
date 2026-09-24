---
"@tallyui/connector-medusa": minor
"@tallyui/database": minor
---

Fix the Medusa connector's incremental pull: Medusa 2.21 honours only the operator form `updated_at[$gte]`, and silently ignored the connector's `updated_at[gte]`, so every pass read the whole catalogue. Add the Medusa id reconcile (ADR-060), so a deleted product or a deleted variant (whose parent's `updated_at` does not change) now reaches the local copy through `replication.products` and `reconcile.ids`. `@tallyui/database` adds a mass-deletion brake to `startIdReconcile`: a pass that would tombstone more than `maxDeleteShare` (default 20%) of local products, and more than 10 of them, queues nothing and warns instead, unless `allowMassDelete` is set.
