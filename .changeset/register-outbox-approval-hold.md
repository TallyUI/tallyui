---
"@tallyui/pos": minor
---

The register outbox no longer lets a closure the store refused for its approval (`register_approval_required` or `register_approval_invalid`) block the register's other commands, but it holds the register's next closure until the refused one is approved again (ADR-082 decision 6). Requeue never resends either refusal, and neither counts in `rejected` or keeps a stuck clock on the held closure.
