---
"@tallyui/pos": patch
---

`addPosOrderCollection` no longer lets a failed migration run's replication outlive the run (RxDB's `cancel()` never stops it), so rapid DM4 retries on the same database raise no unhandled `removed already` rejection. A version-0 order whose version-1 copy is stale (for example, sent by a rolled-back build after a failed run copied it as pending) now migrates with its newer version-0 state instead of losing to the stale copy or looping in RxDB's conflict handling.
