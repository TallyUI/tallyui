---
"@tallyui/core": minor
---

`order.reopen` version 1 (ADR-090), an online command that reopens a store order for editing. `@tallyui/core` adds the envelope, payload and result types, `reopenPayloadErrors` (the strict shape check), the `order.reopen` type in `validateBatch`, an optional `orderReopen` list in `precheckCommand`, the `reopen` result in `parseCommandResult`, the refusal codes (`payment_in_motion`, `order_state`, `revision_conflict`, `forbidden`), `SUPPORTED_ORDER_REOPEN_VERSIONS` and the `orderReopen` capability from `/tally/v1/info`. Nothing sends it yet.
