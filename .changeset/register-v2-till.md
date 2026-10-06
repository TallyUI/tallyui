---
"@tallyui/pos": minor
---

Register v2, the till's half (ADR-078 step 3b, #371). These are additive APIs; the sheets come in a later release.

- **v2 open.** When the store advertises register contract 2 (`capabilities.register >= 2` on `useRegisterSession`), the till sends `register.session.open` as version 2, carrying the till's `deviceName` (trimmed, 1 to 64 characters). `reconcileRegisterCommands` takes `registerContract` and `deviceName`.
- **Conflict.** A session whose open the store refused with `register_session_already_open` becomes `conflict`. It stays current for its register, so the sheet can show, but it takes no sale. Opening on that register is refused with `RegisterSessionConflictError`.
- **Take over and Choose another register.**
  - `useRegisterSession` exposes `conflict` (the refusal's `sessionId`, `openedAt`, `openedBy` and `deviceName`, or `takingOver: true` while the take-over is in flight), plus `actions.takeOver()` and `actions.chooseAnotherRegister()`.
  - The standalone functions are `takeOverSession` and `abandonSession`.
  - Take over on a register v1 store is refused with `RegisterTakeOverError` (`REGISTER_TAKEOVER_UNSUPPORTED`). Choose another register while a take-over is in flight is refused with `REGISTER_TAKEOVER_PENDING`.
- **`abandoned`.** Choose another register moves the session to `abandoned`, a terminal local state: it is never current or sellable, never sent, and it does not block opening. Its unsent commands are rejected locally with `register_session_abandoned`.
- **Answers are derived from stored rows.** `adoptRegisterResults` derives resume, conflict, superseded and the way out of conflict from the stored command rows. It runs at start and on every change to the register's command rows, and `useRegisterSession` runs it for you.
- **Outbox.** `createRegisterOutbox` and `useRegisterOutbox` take an optional `sessions` (the till's `register_sessions`). With it, an open refused as already open stops blocking its register's ledger once its session is abandoned. Without it, that refusal always blocks, so **apps should pass `sessions`**: otherwise a till that chose another register and then reopens the same one never sends again.

**One-way storage note.** A till that rolls back past this release reads a stored `abandoned` session as "needs upgrade" (`RegisterNeedsUpgradeError`) on that register. That is accepted (ADR-078 decision 9).
