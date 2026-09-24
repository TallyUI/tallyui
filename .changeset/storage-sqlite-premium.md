---
'@tallyui/storage-sqlite': minor
---

`getRxStorageSQLite(database)` now returns RxDB Premium's SQLite storage instead of TallyUI's own engine, so writes are transactional and queries run on real SQLite. The call is unchanged: pass a synchronous SQLite handle such as expo-sqlite's `openDatabaseSync(...)`. `rxdb-premium@16.21.1` is now a peer dependency that your app installs under its own RxDB Premium licence. Use one handle per RxDB database; the storage never closes the handle, your app does.
