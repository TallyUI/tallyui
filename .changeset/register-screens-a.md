---
"@tallyui/components": minor
"@tallyui/core": minor
---

Register screens (WCPOS `next` port, ADR-032), driven by `useRegisterSession`: `RegisterPicker`, `OpenRegisterCard`, `RegisterBar` (one status pill; "Register ›"), `MovementSheet` (labelled "Amount" and "Reason"; a reason for every movement; same-tick taps coalesced), `RegisterPanel` (expected in the drawer; Undo by reversal; blind mode hides amounts) and `RegisterColumn`. `@tallyui/core` adds `currencySymbol(currency, locale?)`.
