---
'@tallyui/core': minor
---

order.create version 10: a payment may carry `methodId`, the payment method's own id (shape-checked: 1–64, no NUL; refused below 10). New `wireMethodOf` and `legMethodId` helpers.
