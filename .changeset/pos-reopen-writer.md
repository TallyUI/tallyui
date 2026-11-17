---
'@tallyui/pos': minor
---

finalizeOrder completes a reopened store order (ADR-090): it writes the store ids, the base revision and the refund due, and the row is sent as order.update.
