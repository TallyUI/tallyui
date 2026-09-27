---
"@tallyui/pos": patch
---

The order outbox reads its pending batch, its pending count and the rejected orders to requeue straight from the storage, past RxDB's query cache. In RxDB 16.21.1 a sale inserted while a cached query's storage read was in flight never reached that query, so the outbox left it unsent until the app restarted. Before patching a sent order, the outbox now checks the order's stored state the same way, because a `findOne(id)` can go stale too. New exports `readFresh(collection, query)` and `countFresh(collection, selector)` do these reads.
