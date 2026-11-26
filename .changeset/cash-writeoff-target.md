---
'@tallyui/pos': patch
'@tallyui/components': patch
---

A zero-remainder cash write-off now goes on the last leg counting toward paid that is not a cash leg carrying units (a cash part pick), falling back to the last counting leg only when every counting leg is one, and `remainderEntriesMinor` leaves out only the entries of cash legs carrying units, so a later remainder always counts the write-off (ADR-094 item 1, #1365). `@tallyui/pos` adds the pure `writeOffLeg` helper, which `addTender` and the tender pane's 16-entry check both use, so they keep agreeing on the leg. Cycles of voiding an earlier card and taking cash at zero after a pick can no longer write off one remainder after another and undercharge the sale.
