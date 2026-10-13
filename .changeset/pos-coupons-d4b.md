---
"@tallyui/pos": minor
---

A sale the store refused over its coupons can be reopened as a parked sale (#501, ADR-077 step d4b). No app shows the action yet, so nothing changes for a cashier.
- `reopenRefusedOrder(orderId, deps)` rebuilds a `coupon_invalid` or `total_mismatch` refusal as a parked sale without its coupons. The parked sale carries the order's payments, and its note gives the store's reason. A second call returns the parked sale already written. The refused order is marked with `reopenedAt` and stays as the record. The function refuses with `ReopenRefusedOrderError` when the order is missing, not rejected, refused for another reason, already replaced by a finalized sale, or in a register session that is not open.
- A refused order counts nowhere once its finalized successor (`saleId`) exists (`replacedOrderIds`): it is left out of Needs attention, the outbox's rejected count, the Z report and the register's live expected figures. Until then it counts like any rejected order. `isReopened` only tells that a reopen was started.
- `requeue` no longer resends a `coupon_invalid` or `total_mismatch` refusal.
- `isRequeueable(code)` reports whether the outbox resends a refusal with that code.
