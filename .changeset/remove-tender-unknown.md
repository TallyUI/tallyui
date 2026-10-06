---
'@tallyui/pos': patch
---

`useSale().removeTender()` with an id not among the payments changes nothing (it no longer emits a new snapshot).
