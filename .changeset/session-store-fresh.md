---
'@tallyui/pos': patch
---

`stampSession`, `recordMovement` and `voidMovement` check that the session is live with a primary-key storage read instead of a cached `findOne`, and so does `recordMovement`'s re-read after its insert. A session closed by a write that skips that cached query, as a server sync would, is no longer taken as open until the app restarts.
