---
'@tallyui/storage-sqlite': minor
---

Adds the web storage (ADR-061): `getRxStorageSQLiteWasm` from `@tallyui/storage-sqlite/web` runs RxDB Premium's SQLite storage on `@sqlite.org/sqlite-wasm`'s opfs-sahpool VFS, in one dedicated worker owned by the live tab, reached through premium's `getRxStorageWorker` in mode `'one'`. The app supplies the worker input, for example `() => new Worker(new URL('@tallyui/storage-sqlite/web-worker', import.meta.url), { type: 'module' })`. `@sqlite.org/sqlite-wasm` is now a peer dependency that your app installs. The returned storage carries `tallyEngine: 'sqlite-sahpool'` so callers can recognise it. The root export is unchanged and does not pull in wasm.
