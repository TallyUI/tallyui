---
"@tallyui/storage-sqlite": minor
---

Tell the three start failures apart (#293), each with its own sentence for the cashier. Storage unavailable, as in a Safari private window where the browser gives the worker no usable OPFS, is the new `StorageUnavailableError`, recognised with `isStorageUnavailableError`. Another tab holding the database is recognised with the new `isStorageHeldError`. A stale worker stays `isRxdbRemoteVersionMismatch` from `@tallyui/core` (RM1). `isStorageWorkerStartError` still means any failed start except storage unavailable, and every start error carries its cause's name and message in its own message.
