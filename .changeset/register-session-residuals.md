---
"@tallyui/pos": minor
---

`stampSession(order, sessionId, sessions)` is the only way to set a `PosOrder`'s `sessionId`: it verifies the session is still `open` or `counting` before stamping, so a caller that skips `requireOpenSession` can no longer leave a sale off every Z with an unchecked, closed session id. **`finalizeOrder` no longer takes a `sessionId` option;** stamp its result with `stampSession` instead.

**`recordMovement` now takes the closures collection: `recordMovement(sessions, movements, closures, input)`.** After inserting a movement, it re-reads the session. If the session closed in the gap, the movement is removed and `RegisterSessionClosedError` is thrown only when the session's closure row is already frozen without it. If that closure row lists it, the movement is returned as counted. With no closure row yet, the movement is kept and the new, exported `RegisterMovementStrandedError` is thrown: it carries the movement's `id` and `session_id`, and its message can be shown to the cashier as it is. The caller must not record that movement again; registers job c's server resolves stranded movements. A failed `remove()` throws `RegisterMovementStrandedError` too, and a failed re-read returns the movement as recorded.
