---
"@tallyui/storage-sqlite": patch
---

`isStorageWorkerStartError` also recognises RxDB's RM1, a stale storage worker built on another RxDB version (for example a cached old worker after an upgrade), so apps show their reload advice for it.
