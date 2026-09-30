---
"@tallyui/core": minor
"@tallyui/connector-medusa": minor
---

Add `parseTaxRounding` and `parseInfoCapabilities`, which read `/tally/v1/info` including its top-level `taxRounding` (#287). The Medusa connector's capability read now carries the store's `taxRounding`.
