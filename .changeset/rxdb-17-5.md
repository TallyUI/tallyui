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
  - Its `rxdb` peer is now `>=17.5.0 <18`.
  - Opening `pos_orders` rejects with `PosOrderOpenClosedError` when the database closes during a migration: RxDB 17.5.0 cancels the migration on close. The open first waits for any write already in flight, so none reaches a closed store.
  - An open that needs no migration resolves only once RxDB allows writes, so a sale saved straight after it is never refused with COL25.
- **`@tallyui/database`:**
  - `createTallyDatabase` returns an RxDB 17 database.
  - In development it adds RxDB's dev-mode plugin when a database is created, not at import.
- **Stored data:** a till's SQLite data written by RxDB 16.21.1 opens unchanged under 17.5.0, and migrates its schema versions.
