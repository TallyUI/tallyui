---
'@tallyui/pos': minor
---

`pos_orders` goes to schema 16 (identity migration, one-way): a payment may store `methodId`. `addTender`/`setTender` take an optional `methodId`, kept through finalize, parking and reopen. The outbox sends it only to a store whose order.create cap is 10 or more (then as version 10); below that every payload is unchanged. New `takingsByMethod`; `reportOrderFromPosOrder` keys a leg with a methodId by its kind and id (`legMethodId`; optional `methodTitle` labels it by its own id). Register rows and payloads are unchanged.
