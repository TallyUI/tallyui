---
'@tallyui/core': minor
---

App and plugin authors can use the register v2 contract (ADR-078): optional open fields `deviceName` and `supersedes`, optional result fields `session.openedAt`, `session.openingFloatMinor`, `resumed` and `superseded`, the `superseded` session status, conflict codes `register_session_superseded` and `register_supersede_forbidden`, error-data types `RegisterSessionAlreadyOpenData` and `RegisterSessionSupersededData`, and the `register_session_unknown` order warning. Payload shape checks and warning readers support these fields; the till does not send v2 yet.
