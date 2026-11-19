---
'@tallyui/database': minor
---

`resetCollection` clears a pulled collection and downloads it again from the start, under a new replication generation. Read `replicationGeneration(collection)` and pass it as `startReplication`'s `generation` on every later start.
