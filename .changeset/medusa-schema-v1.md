---
"@tallyui/database": minor
"@tallyui/connector-medusa": minor
---

A connector schema version bump now drops and resyncs its collection (ADR-060 amendment 9). `createTallyDatabase` adds RxDB's migration-schema plugin and gives each connector collection above version 0 a `v => null` strategy per earlier version, and `startReplication` appends `-v<version>` to the replication identifier above version 0, so the pull starts from no checkpoint. Version 0 collections keep their identifier and never resync. `stock_levels` and `pos_orders` are untouched.

The Medusa products schema is now version 1 and declares `variants[].calculated_price` (object or `null`). **The first sync after upgrading resyncs the Medusa catalogue**: the stored products are dropped when the database opens and download again, once, on the first sync. A collection created with `medusaProductSchema` outside `createTallyDatabase` now needs the migration-schema plugin and `migrationStrategies: { 1: () => null }`.
