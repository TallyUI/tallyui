---
"@tallyui/pos": minor
---

The command outbox no longer retries every HTTP error forever. After 3 consecutive 401s it pauses and sets `authRequired` in its state so the app can ask the cashier to sign in, then resumes on the next `flush()`. A permanent refusal of a whole batch (400, 403, 413, 415, 422) changes no order: sending pauses with `refused: { status, reason }` in the state until the next `flush()`. `requeue(orderIds?)` moves rejected orders back to pending with a new commandId, except those rejected with `idempotency_mismatch`, which are left for reconciliation. `TransportOutcome` gains `unauthorized` and `refused` kinds.
