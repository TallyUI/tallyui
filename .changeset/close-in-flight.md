---
"@tallyui/pos": minor
"@tallyui/components": minor
---

One close in flight per register. `useRegisterSession`'s `closeSession` joins a close already running for the same register, in any hook instance, and returns its closure (the joining call's `counted`, `approvedBy` and `approvedByName` are ignored), so a tap during a close no longer starts a second, overlapping one. The hook returns a new `closing` flag, true while that close is in flight. `RegisterColumn` keeps the count slot up while closing instead of flashing the Finish-closing card, whose button now has `nativeID="register-column-finish-close-button"`. `describeRegisterBarPill` takes `closing` and returns the new `'Close not finished'` pill for a closed session that isn't closing, right after 'Choose a register' and ahead of 'Offline'; `RegisterBar` passes `register.closing`.
