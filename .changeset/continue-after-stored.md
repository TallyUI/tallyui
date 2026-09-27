---
"@tallyui/pos": minor
"@tallyui/components": minor
---

A failed save can now end in Continue once its order is confirmed stored. `useOrderOutbox` gains `isStored(order)`, and `record` now treats an order stored with the same `id` and money-bearing content (`sameSale`, new) as stored whatever its `commandId`, so a Retry after a requeue no longer fails forever; other content throws the new `OrderContentMismatchError`. `useSale` takes an optional `isStored` and exposes `canContinue` and `continueSale()`; `Tender` renders Continue when `canContinue` is true. `newSale()` is now refused while a failed or running save's order isn't confirmed stored; a refusal during a running save asks `isStored` again, so a hung save whose order is stored can still Continue. A confirmed order is never handed to `onSaleCompleted` again (#147's background re-hand is gone). `saleLogger` and `outboxLogger` are now exported.
