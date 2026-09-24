---
"@tallyui/pos": minor
---

The command outbox no longer retries every HTTP error forever. After 3 consecutive 401s it pauses and sets `authRequired` in its state so the app can ask the cashier to sign in, then resumes on the next `flush()`. A permanent refusal (400, 403, 413, 415, 422) moves that batch's orders to `rejected` with `error.code` `http_<status>` (needs attention) instead of retrying. `TransportOutcome` gains `unauthorized` and `refused` kinds.
