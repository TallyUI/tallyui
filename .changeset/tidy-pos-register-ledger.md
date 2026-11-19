---
'@tallyui/pos': patch
---

Internal tidy: the register hook and `writeClosure` build payment ledger rows with one function, and the conflict take-over and abandon actions share one fresh read. Behaviour and exports unchanged.
