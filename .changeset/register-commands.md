---
'@tallyui/core': minor
'@tallyui/pos': minor
'@tallyui/connector-medusa': patch
---

Add `RegisterCommandType`, `RegisterCommandEnvelope` and `AnyCommandEnvelope`, register payloads and results, and the register server capability. `CommandType` and `CommandEnvelope` are unchanged.

Record the local `register_commands` ledger through `reconcileRegisterCommands`, gated in `useRegisterSession` by its new `commands` and `capabilities` options. Commands are recorded but not sent. Medusa reads the `register` contract.
