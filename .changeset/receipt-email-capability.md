---
'@tallyui/core': minor
---

ServerCapabilities.receiptEmail: parseInfoCapabilities reads `/tally/v1/info`'s `receiptEmail: { v: n }` (a safe integer above 0); a malformed value is left out with one warning.
