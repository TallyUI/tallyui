---
'@tallyui/pos': minor
---

Split a payment by units of a line: `set-split-units` picks units, `tender-started` with `paymentId` freezes them to that payment, and `paidUnitsByLine` / `unpaidUnitsByLine` / `pickedUnitsMinor` price the picks exactly. `TenderState` gains `pickedUnits` and `unitAllocations`.
