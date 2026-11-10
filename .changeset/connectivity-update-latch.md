---
'@tallyui/core': minor
'@tallyui/database': minor
---

Adds a connectivity label and an update-required latch.

- **`classifyFailure()`:** a connector may map its own request failures to `offline`, `degraded` or an update-required refusal with this optional method. A connector without it gets a neutral rule: no response is offline, and a timeout or a 5xx is degraded.
- **`createConnectivityTracker`** (`@tallyui/database`) turns request outcomes into a label for the UI. After 30 seconds of failures it reads `offline` or `degraded`, and it goes back to `online` on the first success. The label only reports: being offline or degraded does not stop replication.
- **The update-required latch** is the only thing that holds sync. While it is set, `startReplication` neither pulls nor pushes, so unsent writes wait in the queue. It stays set until `resetUpdateRequired()` is called.
