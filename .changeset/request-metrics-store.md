---
'@tallyui/database': minor
---

A local `request_metrics` collection keeps one row per hour, and `persistRequestMetrics` hydrates a request-metrics counter from it, writes the changed hours every 5 minutes and on `stop()`, and deletes the hours that fall out of the newest 48 (#683).
