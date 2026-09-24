---
"@tallyui/database": minor
---

**Breaking:** `getStorage()` on the web no longer returns Dexie. It throws with guidance to pass RxDB Premium's SQLite-wasm storage explicitly (`@tallyui/storage-sqlite/web`), bundling its worker entry — the web engine ADR-061 pins as `createTallyDatabase`'s target. Any app that relied on the Dexie default breaks; switching is a cold resync, not a data migration.

`multiInstance: true` now throws for every storage (ADR-061): the pinned web engine (opfs-sahpool) cannot share exclusive OPFS handles between tabs, so multi-instance is unsupported until job 3 removes the option along with #42's outbox code.

`createTallyDatabase` applies a 10s write deadline to a storage marked `tallyEngine: 'sqlite-sahpool'`: a write that misses it rejects with `StorageWorkerTimeoutError`, so a dead or hung storage worker surfaces as a clear error instead of hanging — the app's recovery is to reload.
