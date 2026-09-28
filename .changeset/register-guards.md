---
"@tallyui/pos": minor
"@tallyui/core": minor
---

Guard register commands, movement reasons and register ids, exporting RegisterMovementReasonError and RegisterIdInvalidError. Harden register outbox result handling and batch limits.

Make CommandBatchRequest generic while preserving its existing default envelope type.
