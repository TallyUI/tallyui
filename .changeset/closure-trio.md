---
"@tallyui/components": minor
"@tallyui/pos": patch
---

`ClosureSheet` shows who approved the close (`Approved by {name}`, falling back to the approver id without a name) under the figures, blind or not — it's provenance, not a counted figure. `RegisterColumn` offers "Finish closing" when `useRegisterSession`'s session is closed but its closure row was never written (an interrupted close), resuming the close (the store keeps the count persisted on the session) instead of falling through to the cart, where `openSession` would otherwise refuse with `RegisterCloseIncompleteError`. `buildClosureDocument`'s return type now carries `closure.unsynced_count: number` and each movement's `id`/`reason` as `string`, without a cast; no runtime output changed.
