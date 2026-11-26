---
'@tallyui/core': minor
'@tallyui/connector-woocommerce': minor
'@tallyui/pos': minor
'@tallyui/components': minor
---

A refused sale whose order the store created part paid can now have the rest recorded on the store from the till, with no new money taken. `@tallyui/core` adds `SettlePayment`, `SettlePayRequest` and `SettlePayResult`, and `RefusedOrderSettlement` gains an optional `pay`. The WooCommerce connector's `pay` reads the order, records the till's unrecorded payments under new ids only when the store's amount due is exactly their sum and the order is still open, then reads it again: only a completed order is `done`. `@tallyui/pos` adds `canPayRestOnStore`, `unrecordedLegs` and the outbox's `payRestOnStore`; `useOrderOutbox`'s `storeSettlement` option takes the connector's `pay` too and the hook returns `payRestOnStore(orderId)`. The attempt and its payment ids are stored as `storeSettlement` (kind `pay`) before the call, so a repeat sends the same ids; no schema change. `settledOnStore` now counts a `gone` settlement as settled only when the store had recorded nothing. `OrdersList` takes `onPayRestOnStore`, which adds "Pay the rest on store" behind a confirm dialog naming each payment to record; with it, a row with money recorded on the store has no Retry. `OrderSyncNotices` says where the pay stands, never with the store's code or message, and a cancelled sale with cash legs now asks the cashier to record any cash they gave back as a pay-out.
