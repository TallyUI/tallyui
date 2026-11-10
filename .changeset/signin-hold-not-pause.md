---
'@tallyui/database': patch
---

A sign-in error on the pull now holds the replication instead of pausing it: the pull asks the store nothing and a push waits unsent until `resume()`, so rows queued before the first push are no longer lost (#645). `isPaused()` stays `false` during the hold; watch `notice$` for it.
