---
'@tallyui/pos': minor
---

A sale's `complete`, `park` and `resume` refuse with the new `REGISTER_CLOSING` while its register's close is in flight, and `registerView().saving` is also true while a park or resume is in flight, so a close refuses then (#1275).
