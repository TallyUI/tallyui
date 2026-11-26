---
'@tallyui/core': minor
'@tallyui/connector-woocommerce': minor
'@tallyui/pos': minor
'@tallyui/components': minor
---

A refused sale left part paid on the store can now offer “Give back and cancel” through `OrdersList`'s `onReverseOnStore`. The WooCommerce connector implements the optional `RefusedOrderSettlement.reverse`: it voids only the till's recorded manual payments, then reads the order again before cancelling. The outbox's `reverseOnStore` keeps the attempt, command ids and confirmed voids across retries. The till names each payment to give back by hand and the cash to record as a pay-out; if a step fails, the row stays in Needs attention with the confirmed progress.
