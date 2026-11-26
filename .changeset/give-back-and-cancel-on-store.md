---
'@tallyui/core': minor
'@tallyui/connector-woocommerce': minor
'@tallyui/pos': minor
'@tallyui/components': minor
---

**Behaviour change.** Cancel order on store and Give back and cancel are offered only while the register session that took every till payment is still open, and the outbox checks again when the store answers. An app that wires `onCancelOnStore` (5.1.0) loses the button until it passes `OrdersList`'s `openSessionId` and `useOrderOutbox`'s `openSessionId`. An app with no register sessions loses it. Once that session has closed, a manager must settle the sale in the store's admin.

A refused sale left part paid on the store can now offer “Give back and cancel” through `OrdersList`'s `onReverseOnStore`. The WooCommerce connector implements the optional `RefusedOrderSettlement.reverse`: it voids only the till's recorded manual payments, then reads the order again before cancelling. The outbox's `reverseOnStore` keeps the attempt, command ids and confirmed voids across retries. The till names each payment to give back by hand and leaves that money out of its expected figures; if a step fails, the row stays in Needs attention with the confirmed progress.

The cancel notice of 5.1.0 was wrong. It asked for cash given back after Cancel order on store to be recorded as a pay-out, which counted that cash twice against the store's figures. It now lists what to give back, and the till's expected cash, drawer terms and closure leave out the payments of an order cancelled on the store and each payment the store confirmed voided.
