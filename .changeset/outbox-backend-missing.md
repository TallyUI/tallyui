---
'@tallyui/pos': minor
'@tallyui/components': minor
---

A store that keeps answering 404 is no longer silent. After 3 consecutive 404 answers the order and register outboxes set `OutboxState.backendMissing: { since }` (when the first of them arrived), and `SyncStatus` tells the cashier in plain words that sales aren't reaching the online store and are saved on the till, with a detail line for the store owner, instead of showing `retrying (status_404)`; the stuck line shows the same words, with no raw code. `SyncStatus` takes an optional `pluginName` (default `'the POS plugin'`) for that detail. The outboxes keep retrying on their normal backoff, and orders stay pending, so a 404 during a deploy blip recovers on its own. The next answer that isn't a 404 clears it; an offline (`network`) retry changes nothing.
Pass one `createBackendNotFound()` tracker as `backendNotFound` to both `createOrderOutbox` and `createRegisterOutbox` so their 404s count together and the notice shows once, whichever outbox meets it first; without it, each outbox keeps its own.
