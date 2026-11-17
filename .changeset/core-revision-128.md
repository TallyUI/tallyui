---
'@tallyui/core': minor
---

`reopenPayloadErrors` and `updatePayloadErrors` accept a `baseRevision` of up to 128 characters (ADR-090); a store revision is an opaque token, and WooCommerce's is 71. Ids stay at 64.
