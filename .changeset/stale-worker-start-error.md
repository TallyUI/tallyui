---
"@tallyui/core": patch
"@tallyui/storage-sqlite": patch
"@tallyui/database": patch
---

`isStorageWorkerStartError` and `isStorageWorkerFailure` also recognise RxDB's RM1, a stale storage worker built on another RxDB version (for example a cached old worker after an upgrade), so apps show their reload advice for it. Both call the new `isRxdbRemoteVersionMismatch` in `@tallyui/core`, which recognises RM1 by structure only: an RxError's own `code`, or the remote storage's `could not create instance ` wrapping of an RxError's JSON. `@tallyui/storage-sqlite` now has `@tallyui/core` as a peer dependency.
