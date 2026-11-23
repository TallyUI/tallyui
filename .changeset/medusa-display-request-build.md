---
"@tallyui/connector-medusa": patch
---

connector-medusa: a header value `Headers` refuses (ctx auth, device key, display token) is now refused as `network` without sending and without the value in any error, and a body JSON cannot serialise is refused as `too_large`, so pos no longer re-sends it.
