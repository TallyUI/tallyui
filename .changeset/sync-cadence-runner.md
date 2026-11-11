---
'@tallyui/database': minor
---

`startSyncCadence` is an opt-in runner that calls `reSync()` on its targets on a jittered timer set by the sync cadence profile, and `startReplication` takes an optional `pullBatchSize` that overrides the adapter's pull page size (#683).
