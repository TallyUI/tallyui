---
'@tallyui/pos': minor
'@tallyui/components': patch
---

The register outbox can start when its store opens, as the order outbox does (#290). The new `useRegisterOutbox({ commands, transport, deviceId, isEnabled?, onResult?, backendNotFound? })` runs `createRegisterOutbox` over an already-open `register_commands` collection, and calls `start()` so that till updates left pending (after a refused batch, for instance) go out when the app reopens. It returns `{ state, flush }`. A new collection or device id restarts the outbox, and `commands: null` leaves it idle. Apps that create the register outbox themselves should switch to this hook. `SyncStatus`'s till-updates refusal line now ends "…with the next till update, or when the app is reopened.", matching the sales line.
