---
'@tallyui/pos': minor
'@tallyui/components': minor
---

`OutboxState` gains `rejected?: number`: the order outbox publishes the count of `pos_orders` the store refused (`syncStatus: 'rejected'`) wherever it publishes `pending`, so it rises when a batch result rejects an order and falls when `requeue()` sends one again. The register outbox leaves it unset. While `rejected` is above 0, `SyncStatus` never says "Sales are up to date.": its whole status line (label, polite live region and iOS announcement) is "1 sale needs attention · The online store refused it. Ask the store owner to look at the till's sync log." or "{n} sales need attention · The online store refused them. Ask the store owner to look at the till's sync log.", in place of the waiting count, the stuck and backend-missing sentences and the sending or retrying line. Below it, "Refused sales stay on this till under Needs attention, and each one can be sent again with Retry once the cause is fixed.", then the backend-missing detail when the store is missing. With `rejected` 0 or unset, nothing changes.
