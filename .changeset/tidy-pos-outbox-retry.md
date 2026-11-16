---
'@tallyui/pos': patch
---

Internal tidy: the order and register outboxes share one retry-delay function and backoff defaults, and the order outbox validates an advertised order.create max in one place. Behaviour and exports unchanged.
