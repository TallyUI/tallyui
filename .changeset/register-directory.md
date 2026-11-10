---
"@tallyui/core": minor
"@tallyui/pos": minor
---

Connectors can now offer the store's register directory through an optional `listRegisters`, which returns each register's id, name, default float, variance threshold and expected close time. `@tallyui/pos` adds `suggestFloat`, which suggests a register's opening float: its default float, else the cash counted at the last close.
