---
'@tallyui/core': minor
'@tallyui/database': minor
'@tallyui/components': minor
'@tallyui/connector-woocommerce': patch
---

Replication stops on errors that retrying cannot fix, instead of repeating them every 5 s forever. A till repeating a rejected token is the traffic a store's security plugin blocks.

- `@tallyui/core`: an error class marks itself permanent with `permanent = true` and a string `code`. `isPermanentError()` tests for it, and `SyncNotice` (`{ code, since }`) describes a stopped sync. `ConnectorUnauthorizedError` is permanent.
- `@tallyui/database`: on a permanent pull error, `startReplication` makes that one request, emits one `SyncNotice` on the new `notice$`, and pauses. It does not retry, and `reSync()` does nothing until the app calls the new `resume()` (after sign-in, say). Other pull errors are retried with a doubling delay from `retryTime` up to 5 minutes, and at least the error's `retryAfterMs` when it has one. A successful pull resets the delay. `startReplication` returns a `TallyReplicationState`: RxDB's state plus `notice$` and `resume()`.
- `@tallyui/components`: `SyncStatus` takes an optional `pullNotice` and shows the cashier plain words for it, never the code.
- `@tallyui/connector-woocommerce`: `WooDateFilterError` (`unsupported_store`) is permanent.
