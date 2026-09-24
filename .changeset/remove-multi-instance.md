---
"@tallyui/pos": minor
"@tallyui/database": minor
"@tallyui/storage-sqlite": patch
---

Removes the unreleased multi-tab database machinery in favour of one live tab per store (ADR-061): `CreateDatabaseOptions.multiInstance` (`createTallyDatabase` always passes `multiInstance: false`), the `tally-outbox-flush` and `tally-outbox-state` local documents, and follower forwarding between tabs are all gone. The outbox's public API (`flush`, `requeue`, `start`, `stop`, `state$`) and its single-instance behaviour are unchanged. Apps enforce one live tab with `startLiveTab`.

`@tallyui/storage-sqlite`'s worker now swallows the `ready` promise's rejection so a pool install failure before any `createStorageInstance` call doesn't surface as an unhandled rejection, and its `files` list no longer publishes test files, matching `@tallyui/database` and `@tallyui/pos`.
