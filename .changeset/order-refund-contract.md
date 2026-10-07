---
"@tallyui/core": minor
"@tallyui/pos": minor
"@tallyui/connector-vendure": minor
---

`order.refund` version 1 (ADR-080), an online refund command on the command channel. `@tallyui/core` adds the envelope and payload types, `refundPayloadErrors` (the strict shape check), the `order.refund` type in `validateBatch`, an optional `orderRefund` list in `precheckCommand`, the `refund` result in `parseCommandResult`, the refusal codes (`nothing_to_refund`, `quantity_exceeds`, `amount_mismatch`, `order_state`, `not_till_order`, `forbidden`, `no_open_session`), the `orderRefund` capability from `/tally/v1/info`, and refunds in `deriveSessionFigures`: a session's expected figures fall by the refunds it made, and it returns `refundsTotalMinor` when refunds are passed (callers that pass none get the same result as before). `@tallyui/pos` adds `sendOrderRefund(transport, envelope)`, which sends one refund and never queues it. `@tallyui/connector-vendure`'s `getVendureOrder` also reads each line's placed quantity and prorated prices and each refund's amounts and metadata, and `vendureRefundable(order)` computes what is left to refund.
