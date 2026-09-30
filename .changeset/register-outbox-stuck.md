---
'@tallyui/pos': minor
---

The register outbox now sets `OutboxState.stuck` when the store has kept failing a sent register command for 15 minutes of answered time (`STUCK_AFTER_MS`, shared with the order outbox; offline gaps pause the clock), so the app can say since when till updates haven't reached the online store. The clock clears when the command is applied or rejected. It is kept in memory only: a restart starts it afresh.
