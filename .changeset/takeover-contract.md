---
"@tallyui/pos": patch
---

`takeOverSession` now checks register contract 2 itself (#498). It takes an optional `registerContract` (the store's `capabilities.register`). Below 2, or when the contract is missing, it refuses with `RegisterTakeOverError` (`REGISTER_TAKEOVER_UNSUPPORTED`) before it reads or writes anything. A direct caller therefore can no longer queue a version 2 open for a register v1 store. `useRegisterSession` passes its contract through, so the hook behaves as before. Direct callers of `takeOverSession` must now pass `registerContract`.
