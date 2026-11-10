---
'@tallyui/core': minor
'@tallyui/database': patch
---

Fixes the connectivity label and the update-required latch from 3.14.0.

- **`noResponse`** (`@tallyui/core`, new): a connector tags its fetch rejections with `fetch(url, init).catch(noResponse)`, so that the neutral rule reads them as offline. A bare `TypeError` no longer counts as offline, since our own code throws those too; a platform network code such as `ECONNREFUSED`, on the error or its `cause`, still does.
- **Any answer from the store ends offline:** an error with a numeric `status`, such as a 401 or a 404, shows the store is reachable.
- **The latch holds a push without dropping it.** While it is set, the pull returns empty pages and a push waits, with one error per latch and no retries, and neither calls the store. A push already in flight finishes and is not sent again. `resetUpdateRequired()` re-probes: the pull asks the store again and held writes go in order.
- **A pause no longer loses or doubles a push** that is held, in flight or waiting to retry. The push waits, before and after the send, until the replication starts again. `startReplication` now retries a failed push itself, still with one error per failed attempt, so a pause during that wait loses no rows. This includes the pause after a sign-in error on the pull. Only a cancel ends the wait.

Known limit: if a paused replication is cancelled after its rows were sent, the next replication sends them again, because RxDB never recorded them.
