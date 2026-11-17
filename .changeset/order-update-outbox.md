---
"@tallyui/pos": minor
---

The order outbox sends a reopened sale (a `pos_orders` row with `storeOrderId`) as `order.update` v1, never
`order.create` (ADR-090 decision 4). New `toOrderUpdateEnvelope`; `toOrderCreateEnvelope` throws for such a row.
`OrderOutboxOptions.transport` and `useOrderOutbox`'s `transport` take `OrderCreateEnvelope | OrderUpdateEnvelope`.
Nothing writes `storeOrderId` yet.
