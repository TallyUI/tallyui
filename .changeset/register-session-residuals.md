---
"@tallyui/pos": minor
---

`stampSession(order, sessions)` is the only sanctioned way to set a `PosOrder`'s `sessionId`: it verifies the session is still `open` or `counting` before stamping, so a caller that skips `requireOpenSession` can no longer leave a sale off every Z with an unchecked, closed session id. `recordMovement` now re-reads the session after inserting a movement and, if it closed in the gap, removes its own movement and refuses, instead of leaving an orphaned movement off the closure that already froze.
