---
'@tallyui/pos': patch
---

A closure the store refuses because its number is not the next one is now renumbered once from the store's counters and sent again, so the register is no longer stuck. Closures still waiting to send behind it are renumbered with it, and the next closure follows them. If the store refuses the renumbered closure too, it stays refused and shows as a till update that needs attention.
