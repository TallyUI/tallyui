---
'@tallyui/core': minor
---

`precheckCommand` now refuses an order.create payload that fails the shape check at every version, not only version 5 and later, as `invalid_payload` with the same messages. The same applies to an order.update's create part at any `createVersion`. A command the store has already applied still replays as `duplicate`, because the replay lookup runs before `precheckCommand`.
