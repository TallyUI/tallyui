---
'@tallyui/core': patch
---

`precheckCommand` now also refuses a malformed order.refund, order.reopen or register command payload as `invalid_payload`, with the messages of `refundPayloadErrors`, `reopenPayloadErrors` and `registerPayloadErrors` (at most 10, joined with `; `). The version check still answers first. Plugins still run the shape check themselves before any lookup; this is a backstop for one that skips it.
