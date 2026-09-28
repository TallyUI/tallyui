---
'@tallyui/pos': minor
'@tallyui/core': minor
---

Fall back to the server's supported order.create version while preserving stored fiscal figures and command IDs. Record the sent version and downgrade in the order audit, and expose command error details.
