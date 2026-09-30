---
'@tallyui/pos': patch
'@tallyui/components': minor
---

`SyncStatus` takes an optional `registerState` (the register outbox's state): waiting till updates are counted ("1 till update waiting to sync", or named beside the sales), so it never says the sales are up to date while any wait, and with no sale waiting the backend-missing sentence says till updates aren't reaching the online store, or, once `registerState.stuck` is set, "Till updates haven't reached the online store since {time}. …". The backend-missing detail now reads "This till couldn't find {pluginName} on the online store. …". With nothing waiting, the line is only "Sales are up to date." (it replaces "All sales synced"), with no sending, retrying or problem text after it; if the store is missing, the detail reads "This till couldn't find {pluginName} on the online store the last time it checked. …". The status line's accessibility label is the whole visible line instead of "Sync status". The order and register outboxes let go of a shared `backendNotFound` tracker on `stop()` and take it up again on `start()` or `flush()`.
