---
'@tallyui/pos': patch
'@tallyui/core': patch
---

Store settings follow-ups to #339 and #341 (#340):

- **A signed-out till is asked to sign in**, not shown "Retrying…". When the capabilities read fails with an error only the till can fix, `useStoreSettings` gives `error` without `nextRetryAt` and doesn't retry by itself, so the app prompts. That covers a till-class error (a 401, or a till that needs updating) and a sign-in error. Every other failure still waits and retries.
- **A `/tally/v1/info` JSON body that isn't an object** (`null`, an array or a scalar) is unknown, not the default rounding.
