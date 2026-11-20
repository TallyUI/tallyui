---
'@tallyui/pos': patch
'@tallyui/components': patch
---
set-split-units refuses a pick above 0 while a plan is set, every tender action that closes Split now clears the picked units (tender-recorded keeps Split open while units are picked), and TenderPane's Take attaches no units when no pick stands, so a host that owns tenderReducer can no longer record stale picks on a planned leg.
