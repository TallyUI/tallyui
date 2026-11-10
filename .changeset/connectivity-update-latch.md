---
'@tallyui/core': minor
'@tallyui/database': minor
---

Adds connectivity: a connector may map its own request failures with an optional `classifyFailure()` to `offline`, `degraded` or an update-required refusal, and one without it gets a neutral rule (no response is offline, a timeout or a 5xx is degraded). In `@tallyui/database`, `createConnectivityTracker` turns request outcomes into `online`, `offline` or `degraded` after 30 seconds of failures, back online on the first success, and holds an update-required latch until it is reset; `startReplication` takes the tracker and, while the latch is set, neither pulls nor pushes.
