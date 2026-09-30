---
'@tallyui/core': minor
---

A batch over 50 commands is answered `413` with `{ code: 'batch_too_large', maxCommands: 50, message: 'At most 50 commands are allowed' }`, never `400` (ADR-038, Front desk ruling 18): `@tallyui/core/server`'s `validateBatch` returns that `body` on its `413` failure so plugins send it as is. `@tallyui/core/server` now also exports `MAX_COMMANDS_PER_BATCH`, and `@tallyui/core` and `@tallyui/core/server` export the `BatchTooLargeBody` type.
