---
'@tallyui/pos': minor
---

The order outbox no longer sends a reopened sale whose `order.update` it cannot build. It keeps the row pending, holds that store order's later rows behind it, and shows it in Needs attention (`UPDATE_UNSENDABLE`). New `isRequeueableOrder(order)`: `requeue()` no longer resends a reopened sale refused with `reopen_required` or `revision_conflict`.
