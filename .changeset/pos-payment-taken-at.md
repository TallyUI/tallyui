---
'@tallyui/pos': minor
---

A payment leg records `takenAt`, when the till took it, and keeps it through park, resume, reopen and the stored order. `pos_orders` moves to version 20 (identity migration, opened through `addPosOrderCollection`); like every pos_orders bump it is one-way.
