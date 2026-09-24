---
"@tallyui/pos": minor
"@tallyui/database": minor
---

**Breaking:** ADR-061 databases are single-instance, so the leader/follower outbox machinery and the `multiInstance` option are gone. Removed: `CreateDatabaseOptions.multiInstance` (`createTallyDatabase` always passes `multiInstance: false`), the `tally-outbox-flush` and `tally-outbox-state` local documents, and follower forwarding between tabs. The outbox's public API (`flush`, `requeue`, `start`, `stop`, `state$`) and its single-instance behaviour are unchanged. Apps enforce one live tab with `startLiveTab`.

`@tallyui/storage-sqlite`, `@tallyui/database` and `@tallyui/pos` no longer publish their test files.
