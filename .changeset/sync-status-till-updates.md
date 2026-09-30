---
'@tallyui/pos': patch
'@tallyui/components': minor
---

`SyncStatus` takes an optional `registerState` (the register outbox's state): waiting till updates are counted ("1 till update waiting to sync", or named beside the sales), so it never says "All sales synced" while any wait, and with no sale waiting the backend-missing sentence says till updates aren't reaching the online store, or, once `registerState.stuck` is set, "Till updates haven't reached the online store since {time}. …". The backend-missing detail now reads "This till couldn't find {pluginName} on the online store. …". With nothing waiting while the store is missing, the line is only "Sales are up to date.", and the detail reads "This till couldn't find {pluginName} on the online store the last time it checked. …"; "All sales synced" never shares a line with a problem sentence. The status line's accessibility label is the whole visible line instead of "Sync status". The order and register outboxes let go of a shared `backendNotFound` tracker on `stop()` and take it up again on `start()` or `flush()`.
