---
"@tallyui/storage-sqlite": minor
---

Tell storage unavailable apart from another tab (#293). When the browser gives the worker no usable OPFS, as in a Safari private window, the worker now throws the new `StorageUnavailableError`, recognised with `isStorageUnavailableError`; `isStorageWorkerStartError` is false for it, since neither closing tabs nor reloading helps. `StorageWorkerStartError` now means OPFS is reachable but another tab holds the database (or a stale worker, or another start failure), and both errors carry their cause's name and message in their own message.
