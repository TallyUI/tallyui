---
'@tallyui/database': minor
---

`measureCollectionBytes(collection, options?)` returns a collection's live document count and data size in bytes (UTF-8 JSON without RxDB metadata, not the bytes on disk), reading a page at a time; `signal` cancels it.
