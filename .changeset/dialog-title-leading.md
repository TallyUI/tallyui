---
'@tallyui/components': patch
---

`DialogTitle` keeps its `leading-none` when a caller passes a text size such as `text-base`, and hands the merged class to `Text` children; a caller's own `leading-*` still wins.
