---
'@tallyui/core': minor
'@tallyui/connector-vendure': patch
'@tallyui/connector-medusa': patch
---

A `/tally/v1/info` answer that says nothing about the store no longer means the default tax rounding (a follow-up to #339).

- **Unknown:** a 2xx that is not JSON, and a `taxRounding` value that is present but malformed, now read as "unknown" (`undefined`), like a network failure or a 5xx. The till's store settings wait and retry instead of selling on a guessed rounding.
- **Unchanged:** a 404 still means an older plugin (`orderCreate: 1`, the default rounding), and so does a well-formed body with no `taxRounding` key.
- **Type change:** `parseInfoCapabilities` now returns `ServerCapabilities | undefined`. It is `undefined` when the body carries a malformed `taxRounding`.
