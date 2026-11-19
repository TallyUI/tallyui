---
'@tallyui/core': minor
---

order.create version 11: version 10 plus the customer's `billing` / `shipping` on a sale with no `taxAddress`, as informational fields. `SUPPORTED_ORDER_CREATE_VERSIONS` and the version types gain 11; `precheckCommand` accepts untaxed addresses at 11 and still refuses them at 9 and 10.
