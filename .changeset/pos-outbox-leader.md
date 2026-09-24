---
"@tallyui/pos": minor
---

The order outbox sends only from the RxDB-elected leader tab. With a `multiInstance: true` database, followers see the leader's auth, refusal, sending and retry state and can request a flush, including after sign-in or requeueing. Multi-tab outboxes require `localDocuments: true`; the outbox registers RxDB's leader-election and local-documents plugins. Single-instance databases behave as before. Tabs join the election through `start()`; a leader that calls `stop()` retains leadership until its database closes, so other tabs cannot send until then.
