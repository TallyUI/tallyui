---
'@tallyui/core': minor
'@tallyui/pos': minor
'@tallyui/connector-medusa': patch
---

Add register command types, payloads and results, and the register server capability. The `order.create` envelope typing is unchanged.

Record the local `register_commands` ledger through `reconcileRegisterCommands`, gated in `useRegisterSession` by its new `commands` and `capabilities` options. Commands are recorded but not sent. Medusa reads the `register` contract.
