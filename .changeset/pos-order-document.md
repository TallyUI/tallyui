---
'@tallyui/pos': minor
---

Adds the `PosOrder` document, the neutral record of a completed sale. `finalizeOrder` turns a fully paid builder `Order` into a pending `PosOrder`: UUIDv7 ids, cash change allocated so that payments reconcile to the total exactly, and a refusal of discounted orders until the command contract supports discounts. `toOrderCreateEnvelope` maps it to the TallyUI Sync Protocol `order.create` command, `posOrderSchema` stores it in a `pos_orders` RxDB collection, and `uuidv7` generates RFC 9562 ids.
