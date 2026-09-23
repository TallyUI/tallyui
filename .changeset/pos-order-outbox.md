---
'@tallyui/pos': minor
---

Adds the order outbox. `createOrderOutbox` sends pending `PosOrder` documents from the `pos_orders` collection through the TallyUI Sync Protocol, in batches of up to 10. It applies each result (`applied`, `duplicate` or `rejected`) with guarded patches and never drops a sale: transport failures and responses that make no progress retry forever, with jittered exponential backoff. `createHttpCommandTransport` posts to `/tally/v1/commands` with the protocol header, and classifies every non-200 or malformed reply as retryable.
