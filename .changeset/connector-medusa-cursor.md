---
"@tallyui/connector-medusa": patch
---

Product replication no longer loses updates inside RxDB's replication loop: a pass ends on the list count, the next pass starts from a high-water mark read at the pass start, an unchanged mark ends the loop, and a pass restarts if rows vanish mid-pass.
