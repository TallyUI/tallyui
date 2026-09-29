---
'@tallyui/core': minor
'@tallyui/pos': patch
'@tallyui/components': patch
---

The shared order.create shape check bounds string lengths and refuses NUL. The till clamps long names at send, refuses over-long pass-through references at finalize, and validates the customer email at entry.
