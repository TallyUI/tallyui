---
'@tallyui/core': minor
'@tallyui/pos': minor
'@tallyui/connector-medusa': patch
---

Add register command payloads and results, per-type numeric command versions, refusal details, and the register server capability.

Add the local `register_commands` ledger and `reconcileRegisterCommands`, gated in `useRegisterSession` by its new `commands` and `capabilities` options. Nothing is sent yet. Medusa reads the `register` contract.
