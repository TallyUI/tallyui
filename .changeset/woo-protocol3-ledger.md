---
'@tallyui/connector-woocommerce': minor
---

Send `X-WCPOS-Protocol: 3`, and pay WCPOS 2.0.x sales through the payment ledger: the order is pushed `pending`, then each payment is recorded (or a free sale closed) before the sale counts as applied. WCPOS 1.10.x and fork stores get the same push body as before. A ledger sale whose store total differs from the till's is refused before any payment is recorded, and a payment the store may have recorded is retried rather than reported unpaid.
