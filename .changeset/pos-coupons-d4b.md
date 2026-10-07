---
"@tallyui/pos": minor
---

A sale the store refused over its coupons can be reopened as a parked sale (#501, ADR-077 step d4b). No app shows the action yet, so nothing changes for a cashier.
- `reopenRefusedOrder(orderId, deps)` rebuilds a `coupon_invalid` or `total_mismatch` refusal as a parked sale without its coupons. The parked sale carries the order's payments, and its note gives the store's reason. The refused order is marked with `reopenedAt` and stays as the record. The function refuses with `ReopenRefusedOrderError` when the order is missing, not rejected, refused for another reason, already reopened, or in a closed register session.
- A reopened order counts nowhere (`isReopened`): it is left out of Needs attention, the outbox's rejected count, the Z report and the register's live expected figures, so its payments count once, on the new sale.
- `requeue` no longer resends a `coupon_invalid` or `total_mismatch` refusal.
