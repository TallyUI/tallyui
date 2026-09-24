---
"@tallyui/database": major
---

**Breaking:** `getStorage()` on the web no longer returns Dexie. It throws with guidance to pass RxDB Premium's SQLite-wasm storage explicitly (`@tallyui/storage-sqlite/web`), bundling its worker entry — the web engine ADR-061 pins as `createTallyDatabase`'s target. Any app that relied on the Dexie default breaks; switching is a cold resync, not a data migration.

**Breaking:** `multiInstance: true` now throws for every storage (ADR-061): the pinned web engine (opfs-sahpool) cannot share exclusive OPFS handles between tabs, so multi-instance is unsupported until job 3 removes the option along with #42's outbox code.

**Breaking:** the storage deadline is now a watchdog. `withWriteDeadline`, `STORAGE_WRITE_DEADLINE_MS`, `StorageWorkerTimeoutError` and `isStorageWorkerTimeout` are removed; `isStorageWorkerFailure` now recognises only `StorageWorkerStartError`. `createTallyDatabase` wraps a storage marked `tallyEngine: 'sqlite-sahpool'` with `withStorageWatchdog`, following WCPOS (ADR-061), and no storage call is ever settled on a clock, because a timed-out write may still commit:

- A write pending longer than 10s (`STORAGE_WRITE_STALL_MS`) is flagged as `stalled`, never rejected; its promise stays pending until the worker answers, and the status returns to `ok` once no stalled writes remain.
- Reads are watched: two consecutive silent 30s windows (`STORAGE_READ_WATCHDOG_MS`), with reads pending and no storage call settling, set the status to `dead`, which is sticky. The recovery is to reload.
- Creating the storage has no deadline, since the worker and wasm can be slow to download.

`getStorageHealth(db)` returns the `Observable<StorageHealth>` (`{ status: 'ok' | 'stalled' | 'dead', stalledWrites, stalledSince? }`) for a database on that storage, and `undefined` for any other, so an app can show "saving is slow…" or "storage stopped, reload".
