---
'@tallyui/pos': patch
'@tallyui/components': patch
---
set-split-units refuses a pick above 0 while a plan is set; close-split, set-plan, clear-plan, arm-custom and request-cancel clear the picked units; tender-started takes an optional units (the recorded leg's own) and freezes those, not the raw picks; TenderPane's Take attaches only the picks that stand on the order and passes them to tender-started. A host that owns tenderReducer can no longer record stale picks on a leg or in unitAllocations.
