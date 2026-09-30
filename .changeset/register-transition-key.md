---
'@tallyui/pos': patch
---

A register session transition's ledger key now includes its status (`session.transition:<sessionId>:<status>:<at>`), so a close in the same millisecond as the count before it is queued with its `counted`, `closedBy` and `approvedBy` instead of being skipped (#258).
