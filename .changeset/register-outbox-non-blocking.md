---
'@tallyui/pos': minor
---

A register command refused with `register_session_superseded` (or abandoned locally) no longer holds up the commands behind it, and a session open now ends its batch (ADR-078).
