---
'@tallyui/core': minor
---

`@tallyui/core`: order.create version 13 is 12 plus `taxExemptReason` (`OrderCreateTaxExemptReason`, `{ text, certificateId? }`), a staff-only reason on a tax-exempt sale, gated by the new `ServerCapabilities.taxExemptReason` (`'optional' | 'required'`). `precheckCommand` takes `supported.taxExemptReason` and refuses the field without the capability, below 13 or on order.update, and an exempt order without a reason under `'required'`; `payloadShapeErrors` and `payloadBoundErrors` check its shape and the `ORDER_TAX_EXEMPT_REASON_MAX` (200) and `ORDER_TAX_EXEMPT_CERTIFICATE_MAX` (64) bounds (`docs/contract/order-create-v13.md`). The till does not send 13 yet.
