---
'@tallyui/storage-sqlite': major
'@tallyui/pos': major
'@tallyui/database': major
'@tallyui/components': patch
'@tallyui/connector-medusa': patch
'@tallyui/connector-shopify': patch
'@tallyui/connector-vendure': patch
'@tallyui/connector-woocommerce': patch
'@tallyui/core': patch
---

RxDB 17.5.0.

- **`@tallyui/storage-sqlite`:**
  - Its `rxdb-premium` peer is now `17.5.0`. Apps install `rxdb-premium@17.5.0` together with `rxdb@17.5.0`.
  - Its storages set RxDB 17's premium flag at import and when called, so the 13-collection cap never applies.
- **`@tallyui/pos`:**
  - Its `rxdb` peer is now `~17.5.0`.
  - Opening `pos_orders` rejects with `PosOrderOpenClosedError` when the database closes during a migration: RxDB 17.5.0 cancels the migration on close. The open first waits for any write already in flight, so none reaches a closed store.
  - An open that needs no migration resolves only once RxDB allows writes, so a sale saved straight after it is never refused with COL25.
- **`@tallyui/database`:**
  - `createTallyDatabase` returns an RxDB 17 database.
  - In development it adds RxDB's dev-mode plugin when a database is created, not at import.
- **Stored data:** a till's SQLite data written by RxDB 16.21.1 opens unchanged under 17.5.0, and migrates its schema versions.

**Upgrade notes**

- **Storage is one-way.** Once a till has opened this version, `pos_orders` is at schema version 4, and an older build
  (such as `@tallyui/pos` 2.0.0 on RxDB 16.21.1) opens it without an error but shows no orders, so it sends none of the
  pending ones until the till is upgraded again. Nothing is deleted: the next upgrade recovers every order, including a
  sale rung during the rollback. Never roll an app back across this version, and never re-ring sales it hides: a
  re-rung sale is a second sale, and the upgrade sends both. See ADR-069 in `docs/DECISIONS.md`.
- Web apps ship the 17.5.0 storage worker with the 17.5.0 main thread. A cached 16.x worker with a 17.5.0 main
  thread is untested and unsupported.
- Apps pin `rxdb` and `rxdb-premium` to exactly `17.5.0`.
- RxDB 17 defaults a replication's `toggleOnDocumentVisible` to true (16.21.1: false). It then resyncs when the tab
  becomes visible, and no longer simulates activity to keep a hidden tab awake, so a browser may throttle a hidden
  tab's pull. RxDB pauses a hidden tab's replication only when that tab isn't the leader; a single-instance database
  is always the leader (read in 17.5.0's `plugins/replication` source, not tested).
