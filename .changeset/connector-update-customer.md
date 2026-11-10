---
"@tallyui/core": minor
---

Add an optional, online-only `updateCustomer(context, id, patch)` connector method with a `CustomerPatch` type, and let `Customer` and `CustomerInput` carry billing and shipping addresses (`CustomerAddress`) and tax ids (`CustomerTaxId`).
