---
'@tallyui/pos': minor
---

`pos_orders` goes to schema version 14 (identity migration, one-way, ADR-090 decision 5): a reopened sale's `storeOrderId` and `baseRevision`, a line's, fee's and shipping line's `storeLineId`, and a payment's `storePaymentId`. Nothing writes them yet, and `order.create` never sends them.
