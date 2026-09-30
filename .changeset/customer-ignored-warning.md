---
'@tallyui/core': minor
'@tallyui/components': patch
---

`CommandWarning` gains `{ code: 'customer_ignored'; customerId: string }` (#266): a sale whose `customerId` doesn't resolve is kept as a guest sale. `knownWarnings` keeps it and `parseCommandResult` accepts it when `customerId` is 1 to 64 characters; the orders list renders it.
