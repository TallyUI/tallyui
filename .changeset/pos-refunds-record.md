---
"@tallyui/pos": minor
---

The till keeps a record of its refunds (ADR-080 amendment 1). `posRefundSchema` and `posRefundCollection()` define `pos_refunds`, a new local-only collection that the app adds as it adds `cash_movements`. `submitOrderRefund({ refunds, transport, envelope })` records each refund before it is sent and then stores the store's answer: `applied`, `rejected`, `unsent` (the store did not take the batch) or still `pending` (the answer is unknown, so resend the same envelope). The session's applied refunds now lower its expected figures. `deriveExpected` and `writeClosure` take optional `refunds`. The closure then fills `period_refunds_total_minor`, each method's `refunds_minor` and `refund_count`, and lists `refund_ids` and `pending_refund_ids`. `useRegisterSession` takes an optional `refunds` collection. Callers that pass no refunds get the same figures and closures as before.
