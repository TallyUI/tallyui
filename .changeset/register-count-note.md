---
'@tallyui/pos': minor
---

`register_sessions` moves to schema version 2. Rows gain `count_note`, the cashier's note on the close count, which the migration sets to `null` on every older row; new sessions start with `count_note: null`. `closeSession` takes `note`, and the closure freezes a non-blank note as `breakdowns.variance_note`.

**Upgrade notes**

- Apps already open the collection with `await addRegisterSessionCollection(db)`, which migrates a version-0 or version-1 collection and keeps the register document.
- **Storage is one-way.** Once a till has opened this version, `register_sessions` is at schema version 2, and an older build shows no sessions until it is upgraded again. Never roll an app back across this version, and never open a second session while it hides the first.
