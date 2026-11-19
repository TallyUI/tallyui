---
'@tallyui/pos': patch
---

`selectClosureRows` now counts a closure with no `store_key` as the scope's store, as renumbering already does (#665), so a keyless closure that was renumbered shows in this store's Z-report list. `openSession` without `storeKey` is deprecated: it warns once (not in production), and `storeKey` becomes required at the next major.
