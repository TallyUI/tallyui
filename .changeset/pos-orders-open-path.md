---
"@tallyui/pos": minor
---

`addPosOrderCollection(db)` is now the way to open `pos_orders`. It resolves only once every version-0 order has migrated, and on DM4 it rejects after the migration has stopped, keeping every order. RxDB's own open path could report the collection ready before orders written after a rollback had moved, and after a DM4 it rejected at once while the migration carried on, so on SQLite a close could interrupt it on every open.
