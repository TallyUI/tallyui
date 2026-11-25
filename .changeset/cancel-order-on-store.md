---
'@tallyui/pos': minor
'@tallyui/components': minor
---

A refused sale whose order the store created with nothing paid can now be cancelled on the store from the till. `@tallyui/pos` adds `canCancelOnStore`, `settledOnStore` and the outbox's `cancelOnStore`, and `useOrderOutbox` takes a `storeSettlement` option (the connector's `cancel` for the open store) and returns `cancelOnStore(orderId)`. The till stores where the cancel stands on the order as `storeSettlement`: `pos_orders` goes to schema version 22, an identity migration that is one-way, like version 21 (an older build cannot open a version-22 store). A settled row (cancelled or gone on the store) leaves `needsAttention` and the outbox's `rejected` count, and `requeue()` never resends a row with a settlement. `discard()` now keeps a refused sale whose order the store created and resolves to false: the till settles that order instead. `OrdersList` takes `onCancelOnStore`, which adds "Cancel order on store" behind a confirm dialog; with it, such a row has no Retry, except a stock refusal, whose Retry reads "Try the payment again". `OrderSyncNotices` says where the cancel stands, never with the store's code or message.
