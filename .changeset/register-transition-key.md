---
'@tallyui/pos': patch
---

A register session transition's ledger key now includes its status (`session.transition:<sessionId>:<status>:<at>`), so a close in the same millisecond as the count before it is queued with its `counted`, `closedBy` and `approvedBy` instead of being skipped (#258). A row stored under the old key still counts as that transition when its status matches, so it is not queued twice.
