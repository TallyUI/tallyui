---
"@tallyui/pos": patch
---

`addPosOrderCollection(db)`: a close now waits for the whole open (up to `POS_ORDER_MIGRATION_CLOSE_WAIT_MS`), not only its migration. A close that landed while the open added the collection or reset the migration checkpoint used to close storage under it; on SQLite the open then failed with rxdb-premium's raw `ReferenceError: context is not defined`. An open called on a database whose close has begun, or one the close stopped waiting for, now stops before any further write and rejects with the new exported `PosOrderOpenClosedError` (`code: 'POS_ORDER_OPEN_CLOSED'`): reopen and call it again.
