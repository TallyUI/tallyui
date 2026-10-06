---
'@tallyui/pos': minor
---

`register_sessions` moves to schema version 1 (ADR-078, #371). The stored `status` is an open string, so later local states need no migration; today's states add `conflict` and `superseded`. Rows gain `server_session_id`, the store session a local id was resumed as, which the migration sets to `null` on every older row.

**Upgrade notes**

- **Apps must switch.** Open the collection with `await addRegisterSessionCollection(db)`, which migrates a version-0 collection safely and keeps the register document. `registerSessionCollection()` now throws at start with an error naming `addRegisterSessionCollection`, because adding the collection with `addCollections` would run RxDB's own migration, which can lose sessions.
- **Storage is one-way.** Once a till has opened this version, `register_sessions` is at schema version 1. An older build opens it without an error but shows no sessions, so the till looks closed until it is upgraded again. Nothing is deleted: the next upgrade recovers every session. Never roll an app back across this version, and never open a second session while it hides the first. See ADR-069 and ADR-078 in `docs/DECISIONS.md`.
