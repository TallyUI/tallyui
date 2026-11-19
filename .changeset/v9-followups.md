---
'@tallyui/core': patch
'@tallyui/pos': patch
---

`precheckCommand` refuses an order.create 9 payload that carries a customer address without `taxAddress` (#790).

The order outbox treats an `unsupported_version` downgrade that would not go strictly lower, or would stay above the store's cap, as a terminal rejection instead of resending (#790).
