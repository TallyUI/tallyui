---
'@tallyui/core': minor
---

Adds the TallyUI Sync Protocol command contract: the `CommandEnvelope`, `CommandResult`, `CommandWarning` and `OrderCreatePayload` types (with their line and payment types), the batch request and response types, the constants `COMMANDS_PATH`, `PROTOCOL_HEADER`, `PROTOCOL_VERSION` and `MAX_COMMANDS_PER_BATCH`, and the `isCommandBatchResponse` guard. These are the shapes pinned in ADR-038 and ADR-039, shared by the POS outbox and backend plugins.
