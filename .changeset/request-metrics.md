---
'@tallyui/database': minor
---

Hourly request metrics ported from WCPOS v2: `createRequestMetrics` keeps the newest 48 hourly buckets of requests, bytes, durations, failures and server load, and `meteredFetch` wraps a `fetch` so each request is recorded.
