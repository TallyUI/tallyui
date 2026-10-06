---
'@tallyui/pos': minor
---

`register_sessions` is at schema version 1 (states `conflict` and `superseded`, `server_session_id`; ADR-078). Open it with `addRegisterSessionCollection(db)`, which migrates a version-0 collection and keeps the register document. An app that opens it with plain `addCollections` must switch, or RxDB's own migration runs (#371).
