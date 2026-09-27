---
"@tallyui/pos": patch
---

`watchFresh` re-reads once per bulk write instead of once per document: it listens to `collection.eventBulks$` rather than the per-document `collection.$`, so a `bulkInsert` of 100 documents costs one storage read, not 100. (RxDB Premium's SQLite storage splits a write into batches of 199 documents and emits one event per batch, so a larger write costs one read per batch.)
