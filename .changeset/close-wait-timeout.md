---
"@tallyui/pos": patch
---

`addPosOrderCollection(db)`: when a close stops waiting (after `POS_ORDER_MIGRATION_CLOSE_WAIT_MS`) while the migration still runs, the migration no longer writes into the stores the close closes. On SQLite it used to fail with a raw `SQLite.bulkWrite() already closed` and an unhandled rejection, and left the SQLite handle unable to write until restart. The open now rejects with `PosOrderOpenClosedError` (`code: 'POS_ORDER_OPEN_CLOSED'`), and the next open on the same database migrates every order.
