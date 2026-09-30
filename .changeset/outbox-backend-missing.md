---
'@tallyui/pos': minor
'@tallyui/components': minor
---

A store that keeps answering 404 is no longer silent. After 3 consecutive 404 answers the order outbox sets `OutboxState.backendMissing: { since }` (when the first of them arrived), and `SyncStatus` tells the cashier in plain words that TallyUI can't be found on the store, instead of showing `retrying (status_404)`. The outbox keeps retrying on its normal backoff, and orders stay pending, so a 404 during a deploy blip recovers on its own. The next answer that isn't a 404 clears it; an offline (`network`) retry changes nothing.
