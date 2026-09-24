---
"@tallyui/pos": minor
---

The order outbox sends only from the RxDB-elected leader tab. With a `multiInstance: true` database, other tabs record sales but never send; the leader also picks up sales and requeues made in other tabs, and another tab takes over if the leader closes. Single-instance databases behave as before. The outbox registers RxDB's leader-election plugin.
