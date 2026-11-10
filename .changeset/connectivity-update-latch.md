---
'@tallyui/core': minor
'@tallyui/database': minor
---

Adds connectivity. A connector may map its own request failures with an optional `classifyFailure()` to `offline`, `degraded` or an update-required refusal. One without it gets a neutral rule: no response is offline (a fetch rejection tagged at the call site with the new `noResponse`, or a platform network code such as `ECONNREFUSED`), a timeout or a 5xx is degraded, and anything else, a `TypeError` from our own code included, says nothing.

In `@tallyui/database`, `createConnectivityTracker` labels the store `online`, `offline` or `degraded`: a verdict changes after 30 seconds of failures, the first success is online again, and any answer from the store (an error with a numeric `status`, such as a 401 or a 404) ends offline. It also holds an update-required latch until `resetUpdateRequired()`.

`startReplication` takes the tracker and records every pull and push outcome. The connectivity label never holds a write; only the update-required latch does. While it is set the pull returns empty pages and a push waits, with one error per latch and no retries, neither calling the store. A push already in flight finishes and is not sent again. `resetUpdateRequired()` re-probes: the pull asks the store again and held writes go in order.

A pause no longer drops a push that is held, in flight or waiting to retry: it waits, before and after the send, until the replication starts again, so it is neither lost nor sent twice. A failed push is retried by `startReplication` itself, still one error per failed attempt, so a pause during the wait (a sign-in error on the pull included) loses no rows. Only a cancel ends the wait. Known limit: rows already sent when a paused replication is cancelled are sent again by the next replication, because RxDB never records them.
