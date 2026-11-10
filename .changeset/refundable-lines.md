---
"@tallyui/pos": minor
---

`refundableLines` shows what is still refundable on each order line after earlier refunds, as a quantity plus net and tax amounts. `priceRefund` prices a chosen refund by each line's cumulative share (ADR-080 amendment 2), caps each quantity at what remains, and returns the `order.refund` v1 payload lines.
