---
"@tallyui/storage-sqlite": minor
---

`getRxStorageSQLiteWasm` returns a storage with `terminate()`, which stops its worker and clears the cached channel, so a fresh open after the live-tab park no longer hangs.
