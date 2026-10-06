---
'@tallyui/core': patch
---

`TallyConnector` gains an optional `emailReceipt(context, orderId, email, { saveToBilling? })` for connectors that can email a store order's receipt (online only, not idempotent).
